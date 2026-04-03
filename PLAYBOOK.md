# Eclipse Hopson Sentinel Core Playbook

This playbook helps you run `Sentinel Core` with a local or cloud model and keep development moving.

## Base flow

1. Install dependencies:

```bash
bun install
```

2. Build the project:

```bash
bun run build
```

3. Start the system:

```bash
sentinel
```

## Fast local start with Ollama

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

sentinel
```

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

sentinel
```

## Useful commands

- `bun run dev`
- `bun run smoke`
- `bun run doctor:runtime`
- `bun run typecheck`
- `npm run rust:build`

## Working rules

- keep tokens only in environment variables
- do not commit local profiles or secrets
- run `doctor:runtime` after provider or environment changes
- keep inherited `CLAUDE_CODE_*` variables intact until dedicated migration work
