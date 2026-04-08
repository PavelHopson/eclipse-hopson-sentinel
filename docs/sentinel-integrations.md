# Sentinel Integrations Guide

Sentinel's OpenAI-compatible provider support and Bridge API make it easy to integrate with external tools. This guide covers four high-value integrations.

---

## 1. ClawRouter — Smart Model Routing

[ClawRouter](https://github.com/BlockRunAI/ClawRouter) is a local LLM router that auto-selects the optimal model from 55+ options based on request complexity. Simple questions → free NVIDIA models, complex coding → Claude Opus. Up to 92% cost reduction.

### Why for Sentinel
Sentinel already supports `OPENAI_BASE_URL` for model routing. ClawRouter replaces manual model selection with automatic routing by complexity — exactly what Sentinel needs for daily coding work where tasks range from "rename a variable" to "architect a new module."

### Setup

```bash
# Install ClawRouter
npx @blockrun/clawrouter
# Runs on localhost:8402
```

```powershell
# Launch Sentinel with ClawRouter
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:8402/v1"
$env:OPENAI_API_KEY="x402"
$env:OPENAI_MODEL="blockrun/auto"
sentinel
```

### Routing Profiles

| Profile | Model ID | Use Case |
|---------|----------|----------|
| Auto | `blockrun/auto` | Balanced cost/quality (daily coding) |
| Eco | `blockrun/eco` | Quick lookups, simple edits |
| Premium | `blockrun/premium` | Architecture decisions, complex refactors |

### Sentinel Provider Presets Mapping
From the roadmap's `fast`, `code`, `voice`, `offline` presets:
- `fast` → `blockrun/eco`
- `code` → `blockrun/auto`
- `voice` → `blockrun/eco` (low latency)
- `offline` → Ollama (unchanged)

---

## 2. MetaClaw — Auto-Skills from Sessions

[MetaClaw](https://github.com/aiming-lab/MetaClaw) is a meta-learning proxy that creates custom skills from conversations. After each session, it summarizes interactions into reusable skills and injects relevant ones into future requests.

### Why for Sentinel
The roadmap mentions "memory and personalization" and "per-project context profiles." MetaClaw delivers this automatically — Sentinel learns your coding patterns, preferred approaches, and project context without manual configuration.

### Setup

```bash
# Install MetaClaw
pip install -e ".[rl,evolve,scheduler]"
metaclaw setup    # Interactive wizard
metaclaw start    # Proxy on localhost:30000
```

```powershell
# Launch Sentinel with MetaClaw
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://127.0.0.1:30000/v1"
$env:OPENAI_API_KEY="metaclaw"
$env:OPENAI_MODEL="your-model-id"
sentinel
```

### Three Modes

| Mode | Description | GPU Required? |
|------|-------------|---------------|
| `skills_only` | Proxy with skill injection, no training | No |
| `rl` | Skills + GRPO LoRA training when batch fills | Recommended |
| `auto` | Skills + RL during idle/sleep windows | Recommended |

### How It Works with Sentinel

```
Sentinel session (coding work)
    ↓
MetaClaw intercepts all LLM calls
    ↓
Session summarized → skill .md saved to ~/.metaclaw/skills/
    ↓
Next Sentinel session → relevant skills injected into system prompt
    ↓
Sentinel gets smarter with each session
```

### Combining with ClawRouter

Stack both proxies for maximum effect:
```
Sentinel → MetaClaw (skills) → ClawRouter (routing) → Best model
```

Configure MetaClaw to forward to ClawRouter as its upstream provider.

---

## 3. TADA TTS — Next-Gen Voice

[TADA](https://huggingface.co/collections/HumeAI/tada) (Hume AI) is an open-source TTS model that generates up to 700 seconds of expressive speech, 5x faster than alternatives, with no hallucinations.

### Why for Sentinel
Sentinel Voice currently uses local Windows TTS (SAPI/Edge). TADA is a massive quality upgrade:
- **Expressiveness**: emotional, natural intonation vs robotic Windows TTS
- **Length**: 700 seconds continuous vs Windows TTS chunking
- **Speed**: 5x faster than competing open-source TTS
- **Accuracy**: no hallucinated words — critical for code-related speech

### Integration Path

TADA runs as a Python inference server. Integration with Sentinel Voice:

1. **Local TADA server** — run HuggingFace model locally (requires GPU)
2. **Sentinel Voice adapter** — add TADA as a TTS backend alongside Windows SAPI
3. **Config selection** — `tts_engine: "tada" | "windows" | "edge"` in voice config

```
Sentinel Core response
    ↓
Sentinel Voice TTS router
    ├── tada (localhost:PORT) — high quality, needs GPU
    ├── windows (SAPI) — offline fallback, no GPU
    └── edge (online) — good quality, needs internet
```

### Roadmap Alignment
Maps directly to these roadmap items:
- "improve TTS voice selection and fallback rules"
- "support a dedicated concise speaking style for TTS responses"
- "measure latency and quality per provider in voice workflows"

---

## 4. Telegram / Discord — Remote Sentinel Control

Official Anthropic MCP plugins that bridge messengers to Claude Code. Sentinel's Bridge API enables the same pattern — control Sentinel from your phone.

### Why for Sentinel
The roadmap mentions "desktop shell" and remote operation. Telegram/Discord bots provide immediate mobile access without building a custom app. Send a message to your bot → Sentinel executes on your machine → responds in the chat.

### Architecture

```
Phone (Telegram/Discord)
    ↓
Bot (MCP server on Bun)
    ↓
Sentinel Bridge API (localhost)
    ↓
Sentinel Core (executes task)
    ↓
Response back to messenger
```

### Telegram Setup

```bash
# 1. Create bot via @BotFather → get token
# 2. Install MCP server (requires Bun)
# 3. Configure bridge connection:
#    Bot → POST http://localhost:BRIDGE_PORT/v1/chat
# 4. Pair via 6-char code
```

### Discord Setup

Same pattern but with Discord Developer Portal bot. Extra features:
- Thread support (conversation context)
- Message history (last 100 messages)
- Custom emoji reactions

### Use Cases

| Message | Sentinel Action |
|---------|----------------|
| "git status on my project" | Runs shell, reports back |
| "run tests and tell me results" | Executes, sends summary |
| "explain the auth module" | Reads code, responds |
| "deploy to staging" | Runs deployment script, notifies |
| "what did I change today?" | Runs `git log --since=today` |

### Roadmap Alignment
Maps to:
- "orchestrate project startup routines"
- "provide status reports about current workspaces"
- "run trusted local scripts"
- "desktop presence instead of terminal-only interaction" (mobile presence)

---

## 5. WhisperLiveKit — Real-Time STT with Speaker Diarization

[WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) is a self-hosted real-time speech-to-text system with speaker identification. Uses Whisper + Sortformer/Diart diarization, runs locally via FastAPI + WebSocket.

### Why for Sentinel
Sentinel Voice currently uses one-shot STT (record → transcribe → done). WhisperLiveKit brings:
- **Streaming transcription** — words appear as you speak, not after
- **Speaker diarization** — knows who said what (critical for meetings/pair programming)
- **200+ languages** via NLLB translation
- **Multiple backends** — Faster-Whisper (GPU), MLX (Apple Silicon), Voxtral
- **OpenAI-compatible API** — drop-in replacement for existing STT calls

### Setup

```bash
# Install
pip install whisperlivekit[gpu]  # or [mlx] for Apple Silicon

# Run server
wlk-server --port 8000
# Web UI at http://localhost:8000
# WebSocket at ws://localhost:8000/asr
# OpenAI-compatible API at http://localhost:8000/v1/audio/transcriptions
```

### Integration with Sentinel Voice

```
Microphone (continuous)
    ↓
WhisperLiveKit (localhost:8000/asr via WebSocket)
    ↓ streaming text + speaker labels
Sentinel Voice client
    ↓ parsed command
Sentinel Core (executes)
    ↓ response text
TTS (TADA or Windows SAPI)
```

Key upgrade over current STT:
- Current: push-to-talk → record → one-shot transcribe → act
- With WLK: continuous listening → streaming transcription → instant action

### Roadmap Alignment
Maps directly to:
- "improve STT error messages and microphone setup guidance"
- "add STT language selection and locale profiles"
- "add confidence-based STT handling"
- "add wake-word research spike" (continuous listening enables wake-word detection)

---

## Integration Priority

| Integration | Impact | Effort | Priority |
|------------|--------|--------|----------|
| ClawRouter | High — instant cost savings | Low — env vars only | **P1** |
| MetaClaw | High — auto-learning | Low — env vars only | **P1** |
| TADA TTS | Medium — voice quality leap | Medium — Python server + adapter | **P2** |
| Qwen3-TTS | High — русский язык + 49 голосов + клонирование | Medium — Python server + adapter | **P2** |
| CosyVoice 3 | High — 0.5B (слабое железо!), русский, zero-shot клон голоса | Low — lightweight model | **P1** |
| WhisperLiveKit | High — streaming STT + diarization | Medium — WebSocket adapter | **P2** |
| Telegram/Discord | High — remote access | Medium — bridge adapter + bot | **P2** |

P1 items work today with zero code changes — just set environment variables.
P2 items require new adapters but align with existing roadmap tracks.
