# Eclipse Hopson Sentinel

> Локальный AI-оператор нового поколения для кода, терминала, автоматизации и голосового взаимодействия.

`Eclipse Hopson Sentinel` — это не просто CLI для работы с моделями.  
Это фундамент для личной операторской системы: локальной, расширяемой, ориентированной на код, voice-интерфейсы и безопасную автоматизацию.

## Почему Sentinel

`Sentinel` создаётся как практический AI-центр для разработчика и power-user:

- работает как coding-agent для проектов и репозиториев
- умеет жить в терминале, а не только в браузере
- строится вокруг локального control flow, а не только облачного UX
- получает собственный voice-layer, diagnostics, backup discipline и installer flow
- объединяет рабочий TypeScript runtime и развивающийся Rust runtime

Если коротко, `Sentinel` — это шаг от “CLI к модели” к “локальному цифровому оператору”.

## Что уже есть

### Sentinel Core

- TypeScript/Bun runtime для coding-agent сценариев
- работа с кодом, файлами, shell и инструментами
- bridge API для внешних клиентов
- совместимость с OpenAI-compatible провайдерами и локальными моделями

### Sentinel Voice

- отдельный voice client через `sentinel-voice`
- локальный TTS на Windows
- one-shot STT
- terminal-safe push-to-talk
- voice doctor для диагностики среды

### Operator foundation

- persistent bridge sessions
- deterministic config health audit
- локальные snapshot backups
- restore flow для ключевых Sentinel surfaces
- первый Windows installer flow с `DryRun`

## Для кого этот проект

- для разработчиков, которым нужен локальный AI-ассистент для кода
- для тех, кто хочет собрать собственный аналог Claude Code / Jarvis-style operator
- для power-user, которым нужен voice + terminal + automation stack
- для тех, кто хочет контролировать стек, а не только пользоваться чужим SaaS UI

## Ключевые сценарии

### 1. Coding agent

`Sentinel` может быть базой для повседневной работы с проектами:

- разбор репозиториев
- работа с файлами и shell
- маршрутизация в облачные и локальные модели
- build/debug/operator workflow из терминала

### 2. Voice operator

`Sentinel Voice` — это ранний, но уже реальный шаг к локальному голосовому ассистенту:

- озвучивание ответов
- голосовой ввод
- push-to-talk режим
- подготовка к desktop shell и wake-word архитектуре

### 3. Safe local automation

`Sentinel` постепенно получает не только agent-функции, но и инженерную дисциплину:

- backup перед изменениями
- config health scoring
- voice diagnostics
- session persistence

## Архитектура

```mermaid
flowchart LR
    A["User"] --> B["Sentinel Voice"]
    A --> C["Sentinel Core CLI"]
    B --> D["Sentinel Bridge"]
    D --> C
    C --> E["TypeScript Runtime"]
    C --> F["Rust Runtime"]
    E --> G["Files / Shell / Tools / MCP"]
    F --> G
    C --> H["Cloud Models"]
    C --> I["Local Models"]
```

## Текущая структура платформы

| Слой | Назначение | Статус |
| --- | --- | --- |
| `Sentinel Core` | основной coding-agent runtime | рабочая база |
| `Sentinel Bridge` | localhost API для voice и desktop клиентов | уже используется |
| `Sentinel Voice` | voice client, TTS, STT, PTT | MVP |
| `Rust Runtime` | next-generation engine | в развитии |
| `Config Health / Backups` | reliability и operator safety | уже встроены |

## Быстрый старт

### Вариант 1. Установщик для Windows

Из локальной копии репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

### Вариант 2. Запуск из репозитория

```powershell
bun install
bun run build
node .\bin\sentinel
```

### Вариант 3. Голосовой клиент

```powershell
node .\bin\sentinel-voice --list-voices
node .\bin\sentinel-voice --stt --ptt --speak --voice Russian
```

## Настройка моделей

### OpenAI-compatible

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"
sentinel
```

### Ollama

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"
sentinel
```

## Почему это сильнее обычного “ещё одного AI CLI”

- у проекта есть не только runtime, но и operator-архитектура
- voice-stack развивается как часть системы, а не как отдельная игрушка
- bridge, diagnostics, backups и installer уже закладывают product discipline
- проект строится как самостоятельный бренд `Eclipse Hopson`, а не как временный форк

## Документация

- [Расширенная настройка](docs/advanced-setup.md)
- [Быстрый старт для Windows](docs/quick-start-windows.md)
- [Быстрый старт для macOS / Linux](docs/quick-start-mac-linux.md)
- [Гибридная архитектура](docs/hybrid-architecture.md)
- [Установщик для Windows](docs/windows-installer.md)
- [Sentinel Bridge API](docs/sentinel-bridge.md)
- [Sentinel Voice MVP](docs/sentinel-voice-mvp.md)
- [Sentinel Config Health](docs/sentinel-config-health.md)
- [Sentinel Backups](docs/sentinel-backups.md)
- [Инженерный журнал](docs/sentinel-engineering-log.md)
- [Master Roadmap Sentinel](docs/sentinel-roadmap.md)
- [План голосовой архитектуры](docs/sentinel-voice-plan.md)

## Зрелость проекта

Сейчас `Sentinel` уже выглядит как сильная инженерная база, но ещё не как полностью отполированный массовый продукт.

Что уже хорошо:

- сильная core-основа
- voice MVP
- safety/disciplined tooling
- собственный installer flow

Что ещё развивается:

- полный green-path installer
- continuous voice mode
- wake word
- desktop shell
- build hardening и release hardening

## Стратегическое направление

Следующий уровень для `Eclipse Hopson Sentinel`:

- довести установку до “установил и пользуешься”
- сделать desktop presence
- укрепить voice interaction
- развить operator workflows
- постепенно довести систему до уровня полноценного локального цифрового оператора

## Важно

- переменные `CLAUDE_CODE_*` пока сохранены для совместимости с унаследованным runtime
- часть внутренних имен из прежних upstream-слоёв всё ещё сохраняется для стабильности
- для полного локального build/install сейчас по-прежнему нужен `Bun`

## Лицензия

MIT
