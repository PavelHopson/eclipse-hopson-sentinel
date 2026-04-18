# ADR 0002 — MOSS-TTS-Nano as primary TTS engine

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** Project lead

## Context

Sentinel Voice is the outer interaction shell of Eclipse Hopson Sentinel
(see `docs/hybrid-architecture.md`, `docs/sentinel-voice-mvp.md`,
`docs/sentinel-voice-plan.md`). It listens for a wake word, transcribes
speech, runs a request through Sentinel Core, and speaks the reply back.

The TTS (text-to-speech) stage is user-facing — it is literally the
voice the user hears — and it carries three hard constraints that are in
tension with each other:

1. **Local-first / offline-capable.** Sentinel is explicitly a
   local operator. Sending every utterance to a cloud TTS API
   (ElevenLabs, OpenAI TTS, Azure Speech) defeats the product's
   premise and has privacy implications. We want the option to run
   fully offline.
2. **Acceptable voice quality.** The user-facing voice must not sound
   like `espeak` from 2005. The whole experience is ruined if the
   reply voice is obviously robotic.
3. **Runs on modest hardware.** Sentinel must work on a developer
   laptop — and ideally on a Raspberry Pi 4 for embedded / always-on
   scenarios. This rules out 1B+ parameter models that need a GPU to
   be realtime.
4. **Multilingual, including Russian.** Pavel is a Russian speaker and
   the primary user. English-only TTS is not enough.

The existing fallback — system TTS (SAPI on Windows, `say` on macOS,
`espeak` on Linux, wired through `sentinel-tts-universal.mjs`) — is
always available but sounds dated and has uneven quality across
platforms. We need something better as the default, with the system TTS
kept as a safety net.

## Decision

We use **MOSS-TTS-Nano** as the primary TTS engine, exposed to Sentinel
via an HTTP adapter, with automatic fallback to system TTS when the
adapter is unavailable.

The architecture is documented in `docs/moss-tts.md`:

```
TTSRouter
  ├── MossTTSAdapter  → moss-tts-server.py (localhost:8765) → MOSS-TTS-Nano
  └── ShellTTSAdapter → sentinel-tts-universal.mjs         → System TTS
```

Key components:

| File | Responsibility |
|---|---|
| `src/services/ttsAdapter.ts` | Shared `TTSAdapter` interface (contract) |
| `src/services/tts/mossTTSAdapter.ts` | HTTP client that talks to `moss-tts-server.py` |
| `src/services/tts/shellAdapter.ts` | Wraps the existing cross-platform shell TTS |
| `src/services/tts/ttsRouter.ts` | Priority-based router — tries MOSS first, falls back |
| `scripts/moss-tts-server.py` | Python HTTP server (port 8765 default) that owns the MOSS-TTS-Nano model |

The router always tries MOSS first. If the server is not running, if
`GET /health` fails, or if a synthesis call errors out, it transparently
falls back to the shell adapter. From the caller's point of view
(`await tts.speak(text, { language })`), the best available engine is
always used without branching logic at call sites.

MOSS-TTS-Nano was chosen because of three published claims that match
our constraints:

- **0.42 RTF on a Raspberry Pi 4.** Real-Time Factor under 1 means
  synthesis is faster than playback — so a 3-second reply synthesizes
  in ~1.25s on a Pi 4. Usable on modest hardware, generous on a
  developer laptop.
- **20 languages, including Russian.** Covers our primary user and
  leaves headroom for an international rollout.
- **~100M params (~400MB on disk).** Small enough to load into RAM on
  any modern laptop and not embarrassing to bundle as an optional
  component. 48kHz output quality keeps it out of "robot voice"
  territory.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **ElevenLabs API** | Industry-leading voice quality | Cloud-only (violates local-first), per-character pricing, privacy concerns (every utterance leaves the machine), requires API key management | Kills the "local operator" positioning. |
| **OpenAI TTS (`tts-1`, `tts-1-hd`)** | Good quality, already have API key for LLMs | Cloud-only, same privacy / latency problem, English-biased voice set | Same reason as ElevenLabs. |
| **Azure / Google Cloud TTS** | Strong multilingual, realistic voices | Cloud-only, vendor lock-in, privacy, pricing | Same. |
| **Coqui TTS (XTTS-v2)** | Open source, excellent voice cloning | Heavyweight (~2GB model), slow on CPU, Python-only with heavy PyTorch deps, installation is painful across platforms | Too fat for Pi-class targets, distribution is a nightmare. |
| **Bark (Suno)** | Very expressive, can emit non-speech sounds | Extremely heavy (multi-GB), CPU-only synth is impractical, licence restrictions | Wrong weight class entirely. |
| **Piper TTS** | Very fast, small footprint, ONNX-based (easy to ship) | Voice quality is merely "good" (intelligible, a bit flat), fewer language voices than MOSS-TTS-Nano | Serious candidate. We chose MOSS for better quality at the same weight class and wider language support. Piper remains on the table as a future third adapter. |
| **System TTS only (SAPI / say / espeak)** | Zero dependency, ships with the OS | Voice quality is dated (especially espeak on Linux), inconsistent across platforms, weaker for Russian | Good enough as a fallback, not as primary. |
| **In-process TTS (Python binding from Node)** | Zero IPC hop | Would require node-python FFI (complex, platform-specific native builds), violates the ADR 0001 rule that all cross-language calls go over subprocess / HTTP | Incompatible with the hybrid-architecture guardrails. |
| **WASM port of a TTS model** | Runs in the same process, no external server | Not mature for 100M-param models, quality and speed lag the Python version | Not ready. |

## Consequences

### Positive

- **User-facing voice is actually listenable.** A measurable quality
  jump over `espeak` / SAPI on Linux / Windows respectively.
- **Genuine offline operation.** Once the model is downloaded, no
  network call is required. Sentinel voice works on a plane.
- **Russian + 19 other languages.** Covers primary user and
  international reach.
- **Adapter pattern keeps us unblocked.** Because `TTSRouter` hides the
  engine choice behind a single interface, we can add Piper,
  Coqui-XTTS, or any future engine as another adapter without
  touching call sites. The router is where policy lives.
- **Graceful degradation is built in.** If Python or the server is
  not installed, Sentinel still speaks (via system TTS). No hard
  error, no dead voice path. Critical for a product that must feel
  reliable.
- **Runs on a Pi 4.** 0.42 RTF means realistic deployment on
  always-on, low-power hardware — an enabler for future embedded /
  home-assistant form factors.
- **HTTP bridge is honest.** The Python side owns its own venv and
  model weights. The TS side only knows "POST a string, get audio".
  Failures on the Python side cannot corrupt the TS runtime.

### Negative

- **~400MB model download.** First-time setup takes bandwidth and
  disk. We cannot ship the model weights in the npm package — users
  opt in via `pip install moss-tts-nano` and start the server.
- **Python + flask dependency for the happy path.** The user has to
  have a working Python 3 and run `pip install moss-tts-nano flask`.
  Sentinel works without it (shell TTS fallback), but getting the
  "good" voice requires this extra step.
- **Extra process to manage.** `moss-tts-server.py` needs to be
  running. We have `docs/moss-tts.md` explaining how to launch it,
  but there is no "auto-start and supervise" story yet. If the
  Python server crashes, voice silently drops back to system TTS
  until the user restarts it.
- **Port collision risk.** Default port 8765 is fine on a clean
  machine, but we had to make it configurable via `MOSS_TTS_PORT`
  and `MOSS_TTS_URL` env vars to handle shared dev environments.
- **Latency of HTTP hop.** Synthesis goes TS → localhost HTTP →
  Python → model → audio back over HTTP. On a fast machine this is
  negligible (<10ms overhead). On a slow Pi this is visible and
  chips into the 0.42 RTF budget.
- **Voice quality is "good", not "state of the art".** It beats
  system TTS clearly. It does not match ElevenLabs or XTTS-v2 on
  prosody. We accept this trade for the local-first, low-weight
  positioning.
- **License vigilance.** We rely on MOSS-TTS-Nano's published
  license. Any shift by the upstream project (e.g. to a
  non-commercial clause) would force us to swap engines — this is
  part of why the adapter pattern is load-bearing.

### Neutral

- **One more language in the stack.** Python is already present
  (see ADR 0001), so adding a Python TTS server does not change the
  toolchain surface — it reuses what is already there.
- **Testing story is split.** The Python server is tested on the
  Python side; the TS adapter is tested via HTTP mocks on the TS
  side. The router's fallback behavior is the thing that must be
  covered on both sides, and it is.
- **Docs discoverability.** `docs/moss-tts.md` is the canonical
  setup / config reference — env vars, files, router behavior — so
  a new contributor can wire it up without reading the code.

## When we would reconsider

- A new engine emerges that beats MOSS-TTS-Nano on quality at the
  same weight class → add it as a third adapter, make the router
  prefer it, keep MOSS as fallback.
- MOSS-TTS-Nano upstream becomes unmaintained or changes license →
  promote Piper or another open adapter to primary.
- A browser / Electron use case emerges → investigate WASM TTS so we
  can drop the Python bridge in that context.

## References

- Setup guide: `docs/moss-tts.md`
- Voice MVP plan: `docs/sentinel-voice-mvp.md`,
  `docs/sentinel-voice-plan.md`
- Wake word plan: `docs/sentinel-wake-word.md`
- Code: `src/services/tts/ttsRouter.ts`,
  `src/services/tts/mossTTSAdapter.ts`,
  `src/services/tts/shellAdapter.ts`,
  `scripts/moss-tts-server.py`
- Related: ADR 0001 (hybrid architecture — cross-language boundaries
  over subprocess / HTTP, never in-process)
