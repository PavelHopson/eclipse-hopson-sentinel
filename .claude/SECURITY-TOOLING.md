# Security Tooling — eclipse-hopson-sentinel

> Additive-установка из батча eclipse-library 28.05–05.06.2026. Дополняет уже
> стоящий `.claude/skills/Claude-BugHunter` (27.05). Здесь — мета-слой: проверка
> самих скиллов/конфигов на prompt injection / tool poisoning / config drift.
> Всё работает **без API-ключа** в статическом режиме.

## 1. Security Guidance (Anthropic, официальный) — глобально, 1 раз
Pre-tool hook ловит 25 vuln-паттернов при Write/Edit в Claude Code.
```bash
/plugin marketplace add anthropics/claude-code
/plugin install security-guidance@anthropics
```
Docs: https://code.claude.com/docs/en/security-guidance

## 2. AgentShield 1.4.0 — скан `.claude/` (102 правила, без ключа)
```powershell
.\scripts\agent-security-scan.ps1            # static
.\scripts\agent-security-scan.ps1 -Opus      # + Opus 4.6 deep-scan (нужен $env:ANTHROPIC_API_KEY)
```
Версия scanner закреплена в локальном скрипте и CI: обновлять её нужно отдельным
reviewed-изменением, а не автоматически при каждом запуске. CI:
`.github/workflows/agent-security.yml` — авто-скан на PR в `.claude/**` (report-only).
Репо: https://github.com/affaan-m/agentshield

## 3. SkillSpector (NVIDIA) — gate перед install внешних скиллов
```powershell
git clone https://github.com/NVIDIA/SkillSpector; cd SkillSpector; make install
skillspector scan <путь-или-git-url> --no-llm
```

## Разделение ролей
- **Claude-BugHunter** (уже стоит) — сканит **прикладной код** Sentinel (Rust runtime,
  Python providers) на уязвимости перед релизом.
- **AgentShield / SkillSpector** (этот слой) — сканят **сами агентные конфиги и скиллы**
  (`.claude/`) на prompt injection / excessive agency / tool poisoning.
- **Security Guidance** — ловит vuln-паттерны в момент написания кода.
Три уровня = defense-in-depth для локального AI-оператора, который сам пишет и исполняет код.
