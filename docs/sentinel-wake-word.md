# Sentinel Wake Word Detection

## Current Implementation

The wake word module (`src/services/wakeWord.ts`) uses **simple STT-based keyword spotting**:

1. The native `audio-capture-napi` module captures microphone audio in the background.
2. Audio chunks are accumulated and periodically fed to a local STT engine.
3. The resulting transcript is checked for the configured keyword (default: `"sentinel"` or `"эй сентинел"`).
4. When a match is found, the registered callback fires (with a 2-second cooldown between activations).

This approach is straightforward to implement but has trade-offs: it requires a running STT engine, which consumes more CPU than a dedicated wake-word model, and accuracy depends entirely on the STT engine's quality for short utterances.

### Configuration Options

| Option        | Type       | Default      | Description                                    |
|---------------|------------|--------------|------------------------------------------------|
| `keyword`     | `string`   | `"sentinel"` | The wake phrase to listen for                  |
| `sensitivity` | `number`   | `0.5`        | Match sensitivity (0.0 = strict, 1.0 = loose)  |
| `callback`    | `() => void` | —          | Function called when wake word is detected      |

### Usage

```ts
import { createWakeWordEngine } from './services/wakeWord.js'

const engine = createWakeWordEngine({
  keyword: 'sentinel',
  sensitivity: 0.5,
  callback: () => {
    // Activate voice input, show UI, etc.
  },
})

await engine.start()
// ...
engine.stop()
```

## Future Path

The STT-based approach is a starting point. Planned improvements:

### Porcupine (Picovoice)
- Dedicated on-device wake word engine with sub-100ms latency.
- Custom keyword training via the Picovoice Console.
- Available as a Node.js native addon (`@picovoice/porcupine-node`).
- Trade-off: proprietary license, requires an API key.

### Rustpotter
- Open-source wake word engine written in Rust.
- Can be compiled to a native Node addon via napi-rs.
- Lighter than a full STT pipeline; designed specifically for keyword spotting.
- Trade-off: smaller community, fewer pre-trained models.

### Local ML Models
- Whisper-based keyword detection (whisper.cpp with short-context inference).
- TensorFlow Lite with a custom small model trained on the wake phrase.
- Trade-off: more accurate but higher engineering effort and binary size.

## Privacy Considerations

- **All audio is processed locally.** No audio data leaves the device.
- **Audio is never stored.** Chunks are held in memory only during the processing window (~1.5 seconds) and discarded immediately after transcription.
- **No cloud STT dependency.** The wake word pipeline is fully offline. (The main voice input feature may use cloud STT separately, but the wake word module does not.)
- **Opt-in only.** Wake word detection is disabled by default and must be explicitly enabled by the user.

## Battery / CPU Impact

| Engine               | CPU (idle listening) | Notes                                   |
|----------------------|----------------------|-----------------------------------------|
| STT-based (current)  | ~5–15% of one core   | Depends on STT engine; Whisper is heavier |
| Porcupine            | < 1% of one core     | Purpose-built; highly optimized          |
| Rustpotter           | ~1–3% of one core    | Lightweight but less optimized than Porcupine |

Recommendations:
- On laptops (battery), prefer Porcupine or Rustpotter when available.
- The STT-based approach is acceptable for desktop / always-powered setups.
- The module automatically releases the microphone when `stop()` is called — there is zero CPU cost when not listening.
