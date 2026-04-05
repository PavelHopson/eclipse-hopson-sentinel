# Eclipse Hopson Sentinel

`Eclipse Hopson Sentinel` — это гибридная локальная AI-система для разработки и персональной автоматизации.

Проект развивается как двухслойная платформа:

- `Sentinel Core` — coding-agent runtime для кода, файлов, shell, инструментов, агентов и MCP
- `Sentinel Voice` — будущая локальная голосовая оболочка в стиле Jarvis

Сейчас этот репозиторий содержит раннюю, но уже рабочую основу `Sentinel Core`:

- действующий TypeScript/Bun runtime
- импортированный Rust workspace для next-generation движка
- единый launcher

## Видение

Цель — не просто ещё один CLI.

Цель — построить локальную операторскую систему под брендом `Eclipse Hopson`, которая:

- понимает код
- работает через терминальные инструменты
- подключается к облачным и локальным моделям
- позже получает голос, wake word, TTS и desktop-взаимодействие

## Текущие runtime-слои

### 1. Sentinel Core (TypeScript runtime)

Текущая рабочая реализация находится в:

- `src/`
- `scripts/`
- `bin/`
- `package.json`

Сейчас именно этот runtime следует считать основным для повседневного использования.

### 2. Sentinel Rust Runtime

Каталог `rust/` содержит импортированный Rust workspace, который будет развиваться как next-generation runtime.

Сейчас он существует как параллельный движок в развитии.

## Быстрый старт

### Установка зависимостей

```bash
bun install
```

### Сборка

```bash
bun run build
```

### Запуск Sentinel Core

```bash
node dist/cli.mjs
```

или через единый launcher:

```bash
node .\bin\sentinel
```

## Единый launcher

Launcher поддерживает оба движка.

TypeScript runtime по умолчанию:

```bash
sentinel
```

Rust runtime:

```bash
sentinel --engine rust
```

или:

```bash
sentinel rust
```

Совместимость со старым именем:

- `pavelcode` пока сохранён как compatibility entrypoint
- `bin/pavelcode` оставлен как shim на время ребрендинга

## Настройка OpenAI-compatible

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"
node .\bin\sentinel
```

## Настройка Ollama

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"
node .\bin\sentinel
```

## Сборка Rust-части

```bash
cd rust
cargo build --release
```

Ожидаемый бинарник после сборки:

```text
rust/target/release/sentinel-rust
```

На Windows:

```text
rust/target/release/sentinel-rust.exe
```

## Структура репозитория

```text
.
|-- bin/                     # launchers и compatibility shims
|-- docs/                    # документация и архитектурные заметки
|-- rust/                    # next-generation Rust runtime
|-- scripts/                 # сборка и служебные скрипты
|-- src/                     # активный TypeScript runtime
|-- vscode-extension/        # интеграция с VS Code
|-- package.json
`-- README.md
```

## Документация

- [Расширенная настройка](docs/advanced-setup.md)
- [Быстрый старт для Windows](docs/quick-start-windows.md)
- [Быстрый старт для macOS / Linux](docs/quick-start-mac-linux.md)
- [Гибридная архитектура](docs/hybrid-architecture.md)
- [Sentinel Backups](docs/sentinel-backups.md)
- [Sentinel Bridge API](docs/sentinel-bridge.md)
- [Sentinel Config Health](docs/sentinel-config-health.md)
- [Установщик для Windows](docs/windows-installer.md)
- [Sentinel Voice MVP](docs/sentinel-voice-mvp.md)
- [Инженерный журнал](docs/sentinel-engineering-log.md)
- [Master Roadmap Sentinel](docs/sentinel-roadmap.md)
- [План голосовой архитектуры](docs/sentinel-voice-plan.md)
- [Сторонние уведомления](THIRD_PARTY_NOTICES.md)
- [Безопасность](SECURITY.md)

## Стратегическое направление

- стабилизировать `Sentinel Core`
- добавить локальный bridge/API для внешних voice и desktop клиентов
- развивать `Sentinel Voice` как отдельную оболочку вокруг core
- параллельно развивать Rust runtime
- унифицировать бренд, launcher-ы, документацию и operator workflow под `Eclipse Hopson`

## Важно

- переменные `CLAUDE_CODE_*` пока сохранены для совместимости с унаследованным runtime
- некоторые внутренние имена из прошлых upstream-слоёв ещё остались и будут очищаться постепенно
- этот репозиторий является основной базой системы `Eclipse Hopson Sentinel`

## Лицензия

MIT
