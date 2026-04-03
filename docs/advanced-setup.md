# Eclipse Hopson Sentinel Advanced Setup

## Package Install

```bash
npm install -g @eclipse-hopson/sentinel
```

## Build From Repository

```bash
git clone https://github.com/PavelHopson/eclipse-hopson-sentinel.git
cd eclipse-hopson-sentinel
bun install
bun run build
node dist/cli.mjs
```

## Providers

### OpenAI-compatible

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
sentinel
```

### Ollama

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b
sentinel
```

### Codex

If you already use Codex CLI locally, the current inherited runtime can reuse existing credentials.

## Useful Variables

| Variable | Purpose |
| --- | --- |
| `CLAUDE_CODE_USE_OPENAI` | Enables the OpenAI-compatible provider path |
| `OPENAI_API_KEY` | API key |
| `OPENAI_BASE_URL` | Base URL for compatible `/v1` APIs |
| `OPENAI_MODEL` | Model name |
| `CODEX_API_KEY` | Explicit token for Codex |

## Environment Checks

```bash
bun run doctor:runtime
bun run smoke
```

## Compatibility Notes

Some inherited names and environment variables are still preserved for runtime stability while the rebrand is in progress.
