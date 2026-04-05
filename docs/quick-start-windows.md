# Eclipse Hopson Sentinel Quick Start for Windows

## 1. Prepare the environment

- install Node.js 20+
- install Bun
- install `ripgrep` if needed

## 2. Fast installer path

From a local repository checkout:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

Installer details:

- [Windows Installer](windows-installer.md)

## 3. Install the CLI

```powershell
npm install -g @eclipse-hopson/sentinel
```

## 4. Start with OpenAI

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

sentinel
```

## 5. Start with local Ollama

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

sentinel
```

## 6. If the command is not found

- reopen the terminal
- check `npm prefix -g`
- make sure the npm global binaries path is in `PATH`
