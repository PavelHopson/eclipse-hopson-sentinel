# PavelCode на Android через Termux

Полноценная сборка `PavelCode` на Android обычно идет через `Termux` и `proot`-окружение Ubuntu, потому что Bun не работает нативно на Android так же стабильно, как на обычном Linux.

## Краткая схема

1. Установите `Termux`.
2. Поднимите Ubuntu через `proot-distro`.
3. Установите `git`, `curl`, `unzip`, `nodejs`.
4. Установите Bun внутри Ubuntu.
5. Клонируйте ваш репозиторий:

```bash
git clone https://github.com/PavelHopson/pavelcode-cli.git
cd pavelcode-cli
```

6. Установите зависимости и соберите проект:

```bash
bun install
bun run build
```

7. Запустите CLI:

```bash
node dist/cli.mjs
```

## Если нужен OpenAI-compatible режим

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
node dist/cli.mjs
```

## Если нужен локальный Ollama

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b
node dist/cli.mjs
```

## Замечания

- внутренние переменные `CLAUDE_CODE_*` сохранены для совместимости
- на слабых устройствах лучше использовать более легкие модели
- после обновления исходников заново выполняйте `bun run build`
