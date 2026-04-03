# Расширенная настройка PavelCode

## Установка пакета

```bash
npm install -g @pavelhopson/pavelcode
```

## Сборка из репозитория

```bash
git clone https://github.com/PavelHopson/pavelcode-cli.git
cd pavelcode-cli
bun install
bun run build
node dist/cli.mjs
```

## Провайдеры

### OpenAI-compatible

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
pavelcode
```

### Ollama

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b
pavelcode
```

### Codex

Если у вас уже есть локальная авторизация Codex CLI, текущая кодовая база умеет использовать существующие учетные данные.

## Полезные переменные

| Переменная | Назначение |
| --- | --- |
| `CLAUDE_CODE_USE_OPENAI` | Включает OpenAI-compatible провайдер |
| `OPENAI_API_KEY` | API-ключ |
| `OPENAI_BASE_URL` | Базовый URL совместимого `/v1` API |
| `OPENAI_MODEL` | Имя модели |
| `CODEX_API_KEY` | Явный токен для Codex |

## Проверка окружения

```bash
bun run doctor:runtime
bun run smoke
```

## Совместимость

Исторические переменные и некоторые внутренние имена пока сохранены для стабильного запуска. Их можно будет мигрировать отдельным refactor-этапом.
