# PavelCode

`PavelCode` — гибридный AI CLI для разработки с двумя слоями исполнения:

- текущий рабочий `TypeScript/Bun` runtime для повседневного использования
- новый `Rust` runtime как более быстрый и безопасный движок следующего поколения

Проект работает как терминальный coding-agent с поддержкой разных провайдеров моделей, инструментов, агентов, MCP и потокового вывода.

## Что сейчас внутри

### 1. Основной runtime

Текущая реализация в корне репозитория:

- `src/`
- `scripts/`
- `bin/`
- `package.json`

Это основной CLI-слой, который уже можно собирать и запускать через `Bun` и `Node.js`.

### 2. Новый Rust runtime

В каталоге `rust/` находится импортированный Rust workspace, который используется как направление развития следующего поколения `PavelCode`.

Там находятся:

- `rust/crates/api-client`
- `rust/crates/runtime`
- `rust/crates/tools`
- `rust/crates/commands`
- `rust/crates/plugins`
- `rust/crates/claw-cli`

## Быстрый запуск текущего CLI

### Установка зависимостей

```bash
bun install
```

### Сборка

```bash
bun run build
```

### Запуск

```bash
node dist/cli.mjs
```

или

```bash
node .\bin\pavelcode
```

## Единый launcher

Теперь `PavelCode` умеет запускать оба движка через одну команду:

```bash
pavelcode
```

Это запускает текущий TypeScript runtime.

Запуск Rust runtime:

```bash
pavelcode --engine rust
```

или

```bash
pavelcode rust
```

## Запуск с OpenAI

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"
node .\bin\pavelcode
```

## Запуск с Ollama

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"
node .\bin\pavelcode
```

## Сборка Rust runtime

```bash
cd rust
cargo build --release
```

Пока Rust-часть рассматривается как отдельный runtime workspace и не заменяет основной CLI по умолчанию.

## Структура проекта

```text
.
├── bin/                     # launchers текущего CLI
├── docs/                    # документация
├── rust/                    # новый Rust runtime workspace
├── scripts/                 # сборка и служебные скрипты
├── src/                     # текущий TypeScript runtime
├── vscode-extension/        # VS Code extension
├── package.json
└── README.md
```

## Документация

- [Быстрый старт для Windows](docs/quick-start-windows.md)
- [Быстрый старт для macOS / Linux](docs/quick-start-mac-linux.md)
- [Установка для начинающих](docs/non-technical-setup.md)
- [Расширенная настройка](docs/advanced-setup.md)
- [Политика безопасности](SECURITY.md)
- [Локальный playbook](PLAYBOOK.md)
- [Описание гибридной архитектуры](docs/hybrid-architecture.md)
- [Сторонние компоненты и происхождение кода](THIRD_PARTY_NOTICES.md)

## Текущее направление развития

- сохранить работоспособность текущего TypeScript CLI
- постепенно переносить критичные части runtime в Rust
- привести единый бренд, документацию и команды запуска к одному виду
- позже добавить единый launcher с выбором движка

## Важно

- Переменные `CLAUDE_CODE_*` пока сохранены для совместимости текущей кодовой базы.
- Импортированный Rust workspace добавлен как отдельный слой развития и требует собственной сборки через Cargo.

## Лицензия

MIT
