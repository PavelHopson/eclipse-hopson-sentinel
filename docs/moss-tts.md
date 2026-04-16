# MOSS-TTS-Nano Integration

MOSS-TTS-Nano is a neural text-to-speech engine available as a higher-quality
alternative to the built-in system TTS (SAPI / say / espeak).

## Architecture

```
TTSRouter
  ├── MossTTSAdapter  →  moss-tts-server.py (localhost:8765)  →  MOSS-TTS-Nano
  └── ShellTTSAdapter →  sentinel-tts-universal.mjs           →  System TTS
```

The `TTSRouter` tries MOSS-TTS-Nano first. If the server is not running or
synthesis fails, it automatically falls back to the shell-based system TTS.

## Setup

### 1. Install Python dependencies

```bash
pip install moss-tts-nano flask
```

### 2. Start the TTS server

```bash
python scripts/moss-tts-server.py
```

The server listens on port 8765 by default. Override with `MOSS_TTS_PORT`:

```bash
MOSS_TTS_PORT=9000 python scripts/moss-tts-server.py
```

### 3. Verify

```bash
curl http://localhost:8765/health
# → {"engine":"moss-tts-nano","status":"ok"}
```

### 4. Use from TypeScript

```typescript
import { TTSRouter } from './src/services/tts/ttsRouter.js'

const tts = new TTSRouter()

// Lists available engines (MOSS-TTS-Nano appears only when the server is up)
console.log(await tts.listAvailable())

// Speak — automatically picks the best available engine
await tts.speak('Hello world', { language: 'en' })
```

## Configuration

| Environment Variable | Default                  | Description              |
|----------------------|--------------------------|--------------------------|
| `MOSS_TTS_URL`       | `http://localhost:8765`  | Base URL of the TTS server (TypeScript adapter) |
| `MOSS_TTS_PORT`      | `8765`                   | Listen port (Python server) |

## Files

| Path | Purpose |
|------|---------|
| `src/services/ttsAdapter.ts` | Shared TTSAdapter interface |
| `src/services/tts/mossTTSAdapter.ts` | MOSS-TTS-Nano HTTP client adapter |
| `src/services/tts/shellAdapter.ts` | Wrapper around existing shell TTS |
| `src/services/tts/ttsRouter.ts` | Priority-based adapter router |
| `scripts/moss-tts-server.py` | Python HTTP server for MOSS-TTS-Nano |
