param(
  [Parameter(Mandatory=$true)][string]$Launcher,
  [Parameter(Mandatory=$true)][string[]]$ReadRoots
)
$ErrorActionPreference = 'Stop'
# Only the private AppContainer SID receives read/execute; no user/group rights change.
$resolvedLauncher = (Resolve-Path -LiteralPath $Launcher).Path
$voiceSid = (& $resolvedLauncher --prepare | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $voiceSid -notmatch '^S-1-15-2-(\d+-){6}\d+$') { throw 'AppContainer preparation failed' }
foreach ($voiceRoot in $ReadRoots) {
  $resolvedVoiceRoot = (Resolve-Path -LiteralPath $voiceRoot).Path
  $item = Get-Item -LiteralPath $resolvedVoiceRoot -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $resolvedVoiceRoot.Length -lt 15) {
    throw 'Refusing a broad or reparse-point permission target'
  }
  $permission = if ($item.PSIsContainer) { '*' + $voiceSid + ':(OI)(CI)(RX)' } else { '*' + $voiceSid + ':(RX)' }
  & "$env:SystemRoot/System32/icacls.exe" $resolvedVoiceRoot /grant $permission /q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot grant the private voice container read access' }
}
Write-Output $voiceSid
