# PavelCode

`PavelCode` — CLI-агент для разработки с поддержкой разных LLM-провайдеров.

Проект запускается в терминале и поддерживает привычный рабочий цикл: промпты, инструменты, агентов, MCP, slash-команды и потоковый вывод.

Проект адаптирован `PavelHopson` на базе открытого MIT-кода с дальнейшей локализацией и доработкой под собственный репозиторий.

## Возможности

- работа через OpenAI-compatible API, Gemini, GitHub Models, Codex, Ollama и другие совместимые бэкенды
- единый CLI для облачных и локальных моделей
- профили провайдеров через `/provider`
- терминальные инструменты: bash, чтение и запись файлов, поиск, задачи, агенты и MCP
- потоковый вывод ответов и многошаговое выполнение инструментов

## Быстрый старт

### Установка

```bash
npm install -g @pavelhopson/pavelcode
```

Если после установки система сообщает, что не найден `ripgrep`, установите `rg` отдельно и проверьте командой `rg --version`.

### Запуск

```bash
pavelcode
```

Внутри CLI:

- `/provider` — настройка профиля провайдера
- `/onboard-github` — подключение GitHub Models

## Быстрая настройка OpenAI

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o

pavelcode
```

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

pavelcode
```

## Быстрая настройка локального Ollama

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

pavelcode
```

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

pavelcode
```

## Документация

- [Быстрый старт для Windows](docs/quick-start-windows.md)
- [Быстрый старт для macOS / Linux](docs/quick-start-mac-linux.md)
- [Установка для начинающих](docs/non-technical-setup.md)
- [Расширенная настройка](docs/advanced-setup.md)
- [Установка на Android / Termux](ANDROID_INSTALL.md)
- [Локальный playbook](PLAYBOOK.md)
- [Политика безопасности](SECURITY.md)

## Сборка из исходников

```bash
bun install
bun run build
node dist/cli.mjs
```

Полезные команды:

- `bun run dev`
- `bun run smoke`
- `bun run doctor:runtime`

## VS Code

В репозитории есть расширение VS Code в каталоге [`vscode-extension/openclaude-vscode`](vscode-extension/openclaude-vscode), адаптированное под запуск `PavelCode`.

## Важно

- Внутренние переменные окружения вида `CLAUDE_CODE_*` пока сохранены для совместимости с текущей кодовой базой.
- Переименование внутренних конфигов и миграция старых путей лучше делать отдельным этапом, чтобы не сломать существующий runtime.

## Лицензия

MIT
