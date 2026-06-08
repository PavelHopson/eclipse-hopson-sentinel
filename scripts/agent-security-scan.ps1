#!/usr/bin/env pwsh
# Agent security scan — статический режим, БЕЗ API-ключа.
#   .\scripts\agent-security-scan.ps1            # AgentShield + SkillSpector по .claude
#   .\scripts\agent-security-scan.ps1 -Opus      # + Claude Opus 4.6 deep-scan (нужен $env:ANTHROPIC_API_KEY)
# Источник: eclipse-library/INSTALL-2026-06-05.md (батч 28.05–05.06.2026)
param(
  [string]$Path = ".claude",
  [switch]$Opus
)

Write-Host "== AgentShield (static, 102 rules) ==" -ForegroundColor Cyan
$ashArgs = @("scan", "--path", $Path)
if ($Opus) {
  if (-not $env:ANTHROPIC_API_KEY) {
    Write-Warning "ANTHROPIC_API_KEY не задан — Opus-режим пропущен (статический скан выполнится)."
  } else {
    $ashArgs += @("--opus", "--stream")
  }
}
npx --yes ecc-agentshield @ashArgs

Write-Host "`n== SkillSpector (static, --no-llm) ==" -ForegroundColor Cyan
if (Get-Command skillspector -ErrorAction SilentlyContinue) {
  skillspector scan $Path --no-llm
} else {
  Write-Host "skillspector не установлен. Установка:" -ForegroundColor Yellow
  Write-Host "  git clone https://github.com/NVIDIA/SkillSpector; cd SkillSpector; make install" -ForegroundColor Yellow
}
