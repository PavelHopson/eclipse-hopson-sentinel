# PavelCode Local Agent Playbook

Этот playbook помогает быстро запустить `PavelCode` с локальной или облачной моделью и не потерять рабочий ритм.

## Базовый сценарий

1. Установите зависимости:

```bash
bun install
```

2. Соберите проект:

```bash
bun run build
```

3. Запустите CLI:

```bash
pavelcode
```

## Быстрый локальный запуск через Ollama

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

pavelcode
```

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

pavelcode
```

## Полезные команды

- `bun run dev` — быстрая локальная разработка
- `bun run smoke` — проверка, что CLI собирается и стартует
- `bun run doctor:runtime` — диагностика окружения
- `bun run typecheck` — проверка типов

## Практика работы

- держите локальные токены только в переменных окружения
- не коммитьте приватные профили и пользовательские конфиги
- проверяйте `doctor:runtime` после смены окружения или провайдера
- не трогайте внутренние `CLAUDE_CODE_*` переменные без отдельной миграции кода

## Перед публикацией изменений

- проверьте README и docs
- прогоните сборку
- убедитесь, что package name и repository URL указывают на ваш проект
