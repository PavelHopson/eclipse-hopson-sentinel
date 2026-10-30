$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$programsSegment = -join [char[]]@(0x041F, 0x0440, 0x043E, 0x0433, 0x0440, 0x0430, 0x043C, 0x043C, 0x044B)
$canonicalBuilderCache = Join-Path (Join-Path 'E:\ADMIN_HOPSON_PC' $programsSegment) 'Eclipse AI Runtime\cache\electron-builder'
$configuredBuilderCache = [Environment]::GetEnvironmentVariable('ELECTRON_BUILDER_CACHE')
$builderCache = if ([string]::IsNullOrWhiteSpace($configuredBuilderCache)) {
    $canonicalBuilderCache
} else {
    [System.IO.Path]::GetFullPath($configuredBuilderCache)
}
$canonicalBuilderCache = [System.IO.Path]::GetFullPath($canonicalBuilderCache)
if (-not $builderCache.StartsWith($canonicalBuilderCache, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw ('Installer guard accepts only the canonical E-first electron-builder cache: ' + $canonicalBuilderCache)
}

$nsisCandidates = @(Get-ChildItem -LiteralPath $builderCache -Recurse -Filter 'makensis.exe' -File |
    Where-Object { $_.Directory.Parent.Name -eq 'nsis-3.0.4.1' })
if ($nsisCandidates.Count -ne 1) {
    throw ('Expected one root makensis.exe in the E-first cache, found ' + $nsisCandidates.Count)
}
$nsis = $nsisCandidates[0].FullName

$pluginCandidates = @(Get-ChildItem -LiteralPath $builderCache -Recurse -Directory |
    Where-Object {
        $_.Name -eq 'x86-unicode' -and
        $_.Parent.Name -eq 'plugins' -and
        $_.FullName -like '*nsis-resources-3.4.1*'
    })
if ($pluginCandidates.Count -ne 1) {
    throw ('Expected one x86-unicode plugin directory in the E-first cache, found ' + $pluginCandidates.Count)
}
$plugins = $pluginCandidates[0].FullName
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'dashboard/package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid dashboard version' }
$reportDir = Join-Path $repoRoot ('reports/ultron-' + $version)
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$before = @(Get-Process -Name 'Eclipse Ultron','ollama' -ErrorAction SilentlyContinue | ForEach-Object Id | Sort-Object)
$knownActiveImage = ((Get-Process -Id $PID).ProcessName + '.exe')
foreach ($testCase in @(@{ name='active'; image=$knownActiveImage; expected=4 }, @{ name='absent'; image='ultron-does-not-exist-72d4.exe'; expected=0 })) {
    $output = Join-Path $reportDir ('guard-' + $testCase.name + '.exe')
    & $nsis '/V2' ('/DREPO_ROOT=' + $repoRoot) ('/DPLUGIN_DIR=' + $plugins) ('/DPROBE_NAME=' + $testCase.image) ('/DPROBE_OUT=' + $output) (Join-Path $PSScriptRoot 'fixtures/installer-guard.nsi')
    if ($LASTEXITCODE -ne 0) { throw 'NSIS guard fixture build failed' }
    $testProcess = Start-Process -FilePath $output -ArgumentList '/S' -WindowStyle Hidden -PassThru
    if (-not $testProcess.WaitForExit(10000)) { $testProcess.Kill(); throw 'Guard fixture timed out' }
    if ($testProcess.ExitCode -ne $testCase.expected) { throw ('Guard mismatch: ' + $testCase.name + ': ' + $testProcess.ExitCode) }
    Write-Output ($testCase.name + ': expected exit ' + $testCase.expected)
}
$after = @(Get-Process -Name 'Eclipse Ultron','ollama' -ErrorAction SilentlyContinue | ForEach-Object Id | Sort-Object)
if (($before -join ',') -ne ($after -join ',')) { throw 'Process set changed during non-mutating guard test' }
Write-Output 'App and Ollama process IDs unchanged; no installation performed.'
