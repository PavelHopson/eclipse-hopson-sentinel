# Eclipse Hopson Sentinel: быстрый старт для Windows

## 1. Подготовьте окружение

- установите Node.js 20+
- установите Bun
- при необходимости установите `ripgrep`

## 2. Быстрый путь через установщик

Из локальной копии репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

Подробности:

- [Установщик для Windows](windows-installer.md)

## 3. Установка CLI

```powershell
npm install -g @eclipse-hopson/sentinel
```

## 4. Запуск через OpenAI

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

sentinel
```

## 5. Запуск через локальный Ollama

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

sentinel
```

## 6. Если команда не находится

- перезапустите терминал
- проверьте `npm prefix -g`
- убедитесь, что путь к глобальным npm-бинарникам есть в `PATH`
