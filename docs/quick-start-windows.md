# Быстрый старт PavelCode для Windows

## 1. Подготовьте окружение

- установите Node.js 20+
- установите Bun
- при необходимости установите `ripgrep`

## 2. Установите CLI

```powershell
npm install -g @pavelhopson/pavelcode
```

## 3. Запуск с OpenAI

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

pavelcode
```

## 4. Запуск с локальным Ollama

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

pavelcode
```

## 5. Если команда не найдена

- закройте и откройте терминал заново
- проверьте `npm prefix -g`
- убедитесь, что путь к глобальным npm-бинарникам есть в `PATH`
