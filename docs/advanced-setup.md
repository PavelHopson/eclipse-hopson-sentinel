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

## GPT-5.6 routing profiles

Sentinel can route fixed aliases through the existing Codex Responses transport:

| Alias | Model | Default reasoning | Use |
|-------|-------|-------------------|-----|
| gpt56fast | gpt-5.6-luna | low | short bounded and high-volume work |
| gpt56balanced | gpt-5.6-terra | medium | normal product work |
| gpt56deep | gpt-5.6-sol | high | architecture and difficult reviews |

The explicit model IDs work as aliases too. gpt-5.6 maps to gpt-5.6-sol with high reasoning.
A bounded query override remains available, for example gpt56deep?reasoning=medium.

This only changes request routing. It does not grant autonomy, approve tools, or move secrets
into project configuration. Use the existing authenticated Codex credential path, keep external
actions behind confirmation, and evaluate quality, latency, and usage before changing a production
default.