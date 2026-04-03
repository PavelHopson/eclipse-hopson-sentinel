# Быстрый старт PavelCode для macOS и Linux

## 1. Подготовьте окружение

- установите Node.js 20+
- установите Bun
- при необходимости установите `ripgrep`

## 2. Установите CLI

```bash
npm install -g @pavelhopson/pavelcode
```

## 3. Запуск с OpenAI

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o

pavelcode
```

## 4. Запуск с локальным Ollama

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

pavelcode
```

## 5. Если команда не найдена

- перезапустите терминал
- проверьте путь к глобальным npm-бинарникам
- убедитесь, что `PATH` содержит каталог установки npm
