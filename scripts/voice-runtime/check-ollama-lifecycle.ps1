param([Parameter(Mandatory = $true)][ValidateSet('before', 'after-exit', 'after-reopen')][string]$Phase)
$ErrorActionPreference = 'Stop'
$reportRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../reports/ultron-1.2.12'))
$output = Join-Path $reportRoot ('lifecycle-' + $Phase + '.json')
if (Test-Path -LiteralPath $output) { throw 'Lifecycle evidence already exists; refusing overwrite' }

Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class UltronJobInspection {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint rights, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static bool InJob(uint pid) {
    IntPtr handle = OpenProcess(0x1000, false, pid);
    if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try { bool result; if (!IsProcessInJob(handle, IntPtr.Zero, out result)) throw new Win32Exception(Marshal.GetLastWin32Error()); return result; }
    finally { CloseHandle(handle); }
  }
}
"@

# This acceptance run is bound to the two services restored during the approved
# migration. IsProcessInJob(process, NULL) reports ANY Windows job, not ownership
# by Ultron; it cannot by itself prove that closing the UI will kill the service.
$restored = @{
    11434 = @{ pid=61168; created='2026-08-28T20:12:23.590708+02:00' }
    11435 = @{ pid=29976; created='2026-08-28T20:12:23.598385+02:00' }
}
$apps = @(Get-CimInstance Win32_Process -Filter "Name = 'Eclipse Ultron.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object ProcessId,CreationDate)
if (($Phase -eq 'after-exit' -and $apps.Count -ne 0) -or ($Phase -ne 'after-exit' -and $apps.Count -ne 1)) { throw 'Unexpected app lifecycle state' }
$servers = @()
foreach ($port in @(11434, 11435)) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected service binding' }
    $server = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listeners[0].OwningProcess)
    if ($server.Name -ne 'ollama.exe' -or $server.ExecutablePath -ne 'E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime\ollama\ollama.exe') { throw 'Unexpected service process' }
    $expected = $restored[$port]
    if ($server.ProcessId -ne $expected.pid -or $server.CreationDate.ToUniversalTime().Ticks -ne ([DateTimeOffset]::Parse($expected.created)).UtcTicks) { throw 'Restored service identity changed' }
    if ($server.ParentProcessId -ne 43680) { throw 'Unexpected service launcher' }
    $launcher = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $server.ParentProcessId)
    if ($null -ne $launcher -and $launcher.CreationDate -le $server.CreationDate) { throw 'Service launcher has not exited' }
    foreach ($app in $apps) {
        if ($server.CreationDate -ge $app.CreationDate) { throw 'Service does not predate this UI; inspect its ownership before closing' }
    }
    $inJob = [UltronJobInspection]::InJob($server.ProcessId)
    $state = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/api/ps') -TimeoutSec 5
    $servers += [pscustomobject]@{ port=$port; pid=$server.ProcessId; created=$server.CreationDate.ToString('o'); inAnyJob=$inJob; launcherExited=$true; models=@($state.models | Select-Object name,digest) }
}
$primary = @($servers[0].models | Where-Object { $_.name -eq 'qwen3:8b' })
if ($primary.Count -ne 1 -or $primary[0].digest -ne '500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41') { throw 'Expected primary model is not loaded' }
$unrelated = Get-CimInstance Win32_Process -Filter 'ProcessId = 55072'
if ($null -eq $unrelated -or $unrelated.CreationDate.ToUniversalTime().Ticks -ne ([DateTimeOffset]::Parse('2026-08-28T15:06:25.219426+02:00')).UtcTicks) { throw 'Unrelated pre-existing runner changed' }
if ($Phase -ne 'before') {
    $before = Get-Content -LiteralPath (Join-Path $reportRoot 'lifecycle-before.json') -Raw | ConvertFrom-Json
    foreach ($server in $servers) {
        $previous = @($before.servers | Where-Object { $_.port -eq $server.port })
        if ($previous.Count -ne 1 -or $server.pid -ne $previous[0].pid -or $server.created -ne $previous[0].created -or
            (($server.models | ConvertTo-Json -Compress) -ne ($previous[0].models | ConvertTo-Json -Compress))) { throw 'Service or loaded model changed across UI lifecycle' }
    }
}
$receipt = [pscustomobject]@{ measuredAt=[DateTime]::UtcNow.ToString('o'); phase=$Phase; servers=$servers; apps=$apps; unrelatedRunnerPreserved=$true; loopbackOnly=$true; passed=$true }
$json = $receipt | ConvertTo-Json -Depth 6
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $bytes = [Text.Encoding]::UTF8.GetBytes($json); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
$json
