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

## 7. Опциональный Lab-профиль Qwen3.8 Cyber

Этот профиль предназначен для изолированного текстового чата Eclipse Ultron. Он не становится
моделью живого голоса и не получает tools или права Sentinel Operator.

1. Запустите Eclipse Ultron или отдельный Lab Ollama на `127.0.0.1:11435`. Для отдельного
   процесса задайте `OLLAMA_MODELS` на `E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime\models\ollama`;
   встроенный Electron-процесс задаёт этот каталог сам.
2. Проверьте, что Ollama отвечает на `http://127.0.0.1:11435/api/tags`.
3. Из корня репозитория выполните:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-qwen38-cyber.ps1
```

Скрипт скачает non-MTP GGUF примерно на 15 GiB, проверит SHA-256 и создаст модель
`qwen3.8-cyber-iq4xs:27b` через Lab endpoint в его настроенном model store. Подробности и ограничения описаны в
[реестре моделей](ultron-model-registry.md).
