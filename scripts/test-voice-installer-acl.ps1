$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$checker = Join-Path $repoRoot 'dashboard/build/verify-voice-acl.ps1'
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$icacls = Join-Path $env:SystemRoot 'System32/icacls.exe'
$sid = '*S-1-15-2-3401530238-3731070781-1353621829-3068759506-4022790450-2217579969-1039810395'
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'dashboard/package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid dashboard version' }
$fixtureRoot = Join-Path $repoRoot ('reports/ultron-' + $version + '/acl-fixture-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
foreach ($name in @('runtime.mjs','piper-runtime.mjs','supervisor.mjs','session.mjs','dsp.mjs','worker.py','guard.py','model-lock.json','ultron-approved.mp3')) {
    New-Item -ItemType File -Path (Join-Path $fixtureRoot $name) | Out-Null
}
function Assert-Result([string]$label, [int]$expected) {
    & $powershell -NoProfile -NonInteractive -File $checker -VoiceDirectory $fixtureRoot
    if ($LASTEXITCODE -ne $expected) { throw ($label + ': unexpected verifier exit ' + $LASTEXITCODE) }
    Write-Output ($label + ': passed')
}
Assert-Result 'Missing private grant is rejected' 10
& $icacls $fixtureRoot /grant ($sid + ':(OI)(CI)(RX)') /q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare private fixture grant' }
Assert-Result 'Existing inherited RX grant is accepted' 0
$leaf = Join-Path $fixtureRoot 'worker.py'
try {
    & $icacls $leaf /deny ($sid + ':(R)') /q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare private fixture deny' }
    Assert-Result 'Deny on one helper is rejected' 10
} finally {
    & $icacls $leaf /remove:d $sid /q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot clear fixture-only deny' }
}
Assert-Result 'Restored RX grant is accepted' 0
Write-Output 'Only disposable fixture ACLs were changed; no real runtime files were modified.'
