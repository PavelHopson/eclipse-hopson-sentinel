param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "[Sentinel Installer] $message"
}

function Test-CommandExists($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-Step($label, [scriptblock]$action) {
  Write-Step $label
  if ($DryRun) {
    Write-Host "  dry-run: skipped"
    return
  }
  & $action
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$installRoot = Join-Path $env:LOCALAPPDATA 'EclipseHopsonSentinel'
$binRoot = Join-Path $installRoot 'bin'
$sentinelCmd = Join-Path $binRoot 'sentinel.cmd'
$sentinelVoiceCmd = Join-Path $binRoot 'sentinel-voice.cmd'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')

Write-Step "Repository root: $repoRoot"
Write-Step "Install root: $installRoot"

if (-not (Test-CommandExists 'node')) {
  throw 'Node.js is required. Install Node.js 20+ before running this installer.'
}

if (-not (Test-CommandExists 'bun')) {
  if ($DryRun) {
    Write-Step "Bun is missing. A real install would stop here."
    Write-Host ""
    Write-Host "Dry-run summary"
    Write-Host "  Missing prerequisite: Bun"
    exit 0
  }

  throw 'Bun is required. Install Bun before running this installer.'
}

Invoke-Step "Create install directories" {
  New-Item -ItemType Directory -Force -Path $binRoot | Out-Null
}

Invoke-Step "Install dependencies with Bun" {
  Push-Location $repoRoot
  try {
    bun install
  } finally {
    Pop-Location
  }
}

Invoke-Step "Build Sentinel" {
  Push-Location $repoRoot
  try {
    bun run build
  } finally {
    Pop-Location
  }
}

$sentinelCmdContent = @"
@echo off
node "$repoRoot\bin\sentinel" %*
"@

$sentinelVoiceCmdContent = @"
@echo off
node "$repoRoot\bin\sentinel-voice" %*
"@

Invoke-Step "Create sentinel launcher" {
  Set-Content -Path $sentinelCmd -Value $sentinelCmdContent -Encoding ASCII
}

Invoke-Step "Create sentinel-voice launcher" {
  Set-Content -Path $sentinelVoiceCmd -Value $sentinelVoiceCmdContent -Encoding ASCII
}

if ($userPath -notlike "*$binRoot*") {
  Invoke-Step "Add Sentinel bin directory to user PATH" {
    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
      $binRoot
    } else {
      "$userPath;$binRoot"
    }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  }
} else {
  Write-Step "User PATH already contains Sentinel bin directory"
}

Write-Host ""
Write-Host "Installation summary"
Write-Host "  Repo: $repoRoot"
Write-Host "  Bin:  $binRoot"
Write-Host ""
Write-Host "Next steps"
Write-Host "  1. Open a new PowerShell window"
Write-Host "  2. Run: sentinel"
Write-Host "  3. Run: sentinel-voice --list-voices"
Write-Host ""
if ($DryRun) {
  Write-Host "Dry-run complete. No changes were applied."
}
