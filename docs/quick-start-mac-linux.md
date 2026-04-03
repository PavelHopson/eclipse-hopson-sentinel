# Eclipse Hopson Sentinel Quick Start for macOS and Linux

## 1. Prepare the environment

- install Node.js 20+
- install Bun
- install `ripgrep` if needed

## 2. Install the CLI

```bash
npm install -g @eclipse-hopson/sentinel
```

## 3. Start with OpenAI

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o

sentinel
```

## 4. Start with local Ollama

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

sentinel
```

## 5. If the command is not found

- restart the terminal
- check the global npm binary path
- confirm `PATH` includes the npm install directory
