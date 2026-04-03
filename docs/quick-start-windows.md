# Eclipse Hopson Sentinel Quick Start for Windows

## 1. Prepare the environment

- install Node.js 20+
- install Bun
- install `ripgrep` if needed

## 2. Install the CLI

```powershell
npm install -g @eclipse-hopson/sentinel
```

## 3. Start with OpenAI

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

sentinel
```

## 4. Start with local Ollama

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

sentinel
```

## 5. If the command is not found

- reopen the terminal
- check `npm prefix -g`
- make sure the npm global binaries path is in `PATH`
