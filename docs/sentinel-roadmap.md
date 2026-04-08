# Eclipse Hopson Sentinel Roadmap

This roadmap is the working master plan for turning `Eclipse Hopson Sentinel` into a professional local operator platform under the `Eclipse Hopson` brand.

## Strategic priorities

1. make `Sentinel Core` trustworthy for daily coding work
2. make `Sentinel Voice` reliable enough for repeated local use
3. reduce inherited upstream risk through cleanup, testing, and clear contracts
4. create a stable product foundation before chasing advanced assistant features

## Immediate priorities

### P0: Reliability and unblockers

- install and verify `Bun` in the local environment
- run `npm run build`
- run a smoke test for `Sentinel Core`
- run a smoke test for `/sentinel-bridge`
- run a smoke test for `sentinel-voice`
- document exact runtime requirements for Windows
- fix environment-specific blockers one by one instead of layering new features on top of unstable assumptions

### P0: Voice session hardening

- persist bridge sessions to disk so they survive process restarts
- restore bridge sessions on bridge startup
- add session TTL and cleanup rules
- keep `bridgeSessionId -> sentinelSessionId -> cwd` mappings auditable
- add explicit session inspection output for debugging

### P0: Contracts and diagnostics

- stabilize the `voice-v1` bridge response contract
- version the bridge contract explicitly for future breaking changes
- add request validation for bridge endpoints
- add error codes, not just free-form error strings
- add a formal `voice doctor` output contract
- document known environment blockers in one place

## Sentinel Core improvements

### Build and runtime

- fully validate the TypeScript runtime as the current default engine
- fully validate the Rust runtime as the next-generation engine
- define objective criteria for when Rust becomes the default runtime
- add a runtime capability matrix: TypeScript vs Rust
- remove user-facing inherited names left from upstream layers
- separate experimental code paths from production paths

### Code quality

- add type-safe bridge response models shared across server and clients
- reduce duplicated launch logic across scripts and bin entrypoints
- isolate voice-related helpers behind clean modules instead of growing `bin/sentinel-voice` endlessly
- move PowerShell integration to dedicated helpers with common error handling
- add structured logging around bridge sessions and voice requests
- add consistent error normalization for bridge, TTS, and STT flows

### Security and safety

- enforce localhost-only defaults for bridge
- add optional bridge token rotation
- define safe defaults for command execution and permissions in voice-triggered flows
- ensure voice-triggered actions are auditable before enabling more automation
- review exposed endpoints for input validation and abuse prevention
- explicitly separate trusted local use from future remote-control features

### Tests

- add unit tests for bridge response normalization
- add tests for session lifecycle: create, ask, resume, delete
- add tests for CLI flag parsing in `sentinel-voice`
- add regression tests for empty input, malformed JSON, and unauthorized requests
- add contract tests for `voice-v1`
- add smoke tests for launchers and bridge startup

## Sentinel Voice improvements

### MVP hardening

- persist voice session state across client restarts
- add a voice-specific config file or profile
- support command history and voice history review
- support better interruption and cancel flows
- support a dedicated concise speaking style for TTS responses
- add transcript cleanup and text normalization before TTS

### STT and TTS

- improve TTS voice selection and fallback rules
- add TTS truncation rules for long technical answers
- add optional "brief verbal summary" mode before full response
- improve STT error messages and microphone setup guidance
- add STT language selection and locale profiles
- add confidence-based STT handling
- add a retry option when speech recognition confidence is low

### Push-to-talk and interaction model

- add more ergonomic prompt hints in PTT mode
- add a dedicated PTT state indicator in the terminal UI
- support a "listen again" quick action after failed recognition
- support a "repeat last answer" shortcut
- support an "interrupt speaking" action during TTS
- add "confirm before executing risky actions" for voice-driven commands

### Wake word and background listening

- add a wake-word research spike only after microphone permissions and STT are stable
- evaluate local wake-word engines for Windows compatibility
- keep wake-word mode optional and disabled by default
- add battery and CPU impact measurement before enabling background listening
- add privacy modes: push-to-talk only, wake-word only, fully manual

### Desktop shell

- build a lightweight desktop shell or control panel
- show current session, last action, and microphone/TTS state
- add a compact always-on-top mode
- add quick buttons for listen, repeat, stop, and mute
- add a visual confidence indicator for STT
- add a visual "thinking / working / speaking" state machine

## Jarvis-inspired features to build safely

These are good ideas to borrow conceptually without copying code directly:

- local-first voice workflow
- privacy-first positioning
- voice pipeline separation: wake word -> STT -> router -> action -> TTS
- assistant persona with strong product identity
- desktop presence instead of terminal-only interaction
- better device and environment diagnostics

## Personal operator features

### Coding assistant

- open project and workspace shortcuts
- summarize repositories verbally
- explain code sections verbally and in text
- run project-specific workflows by voice
- create files, drafts, and patch suggestions through safe confirmation steps
- voice shortcuts for review, test, search, and explain

### Local system operator

- open apps and folders
- read notifications or reminders
- run trusted local scripts
- provide status reports about current workspaces
- orchestrate project startup routines
- support scheduled local routines later through automations

### Memory and personalization

- define a durable local memory model
- store preferred voice, language, rate, and speech style
- store preferred coding model profiles
- add per-project context profiles
- add assistant modes such as `Operator`, `Coder`, `Research`, `System`
- add user-confirmable memory updates instead of silent persistence

## Model and provider strategy

- formalize OpenRouter profiles for coding and fast responses
- keep Ollama as the offline/local fallback
- add clear provider presets: `fast`, `code`, `voice`, `offline`
- measure latency and quality per provider in voice workflows
- add model routing rules for spoken interactions vs deep coding tasks
- add safer defaults for long-context and voice-oriented exchanges
- integrate [ClawRouter](https://github.com/BlockRunAI/ClawRouter) as smart auto-routing provider (55+ models, <1ms, up to 92% savings)
- integrate [MetaClaw](https://github.com/aiming-lab/MetaClaw) as meta-learning proxy (auto-skills from sessions, no GPU in skills_only mode)

## External integrations

> See [sentinel-integrations.md](sentinel-integrations.md) for full setup guides.

### P1: Zero-code integrations (env vars only)

- ClawRouter — auto-select optimal model by request complexity (`blockrun/auto`)
- MetaClaw — create skills from Sentinel sessions, inject into future prompts (`metaclaw/auto`)

### P2: Adapters required

- [TADA TTS](https://huggingface.co/collections/HumeAI/tada) — replace Windows SAPI with expressive open-source TTS (700s speech, 5x faster)
- [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) — streaming STT with speaker diarization, replaces one-shot STT with continuous WebSocket transcription
- Telegram/Discord bots — remote Sentinel control via messenger, leveraging Bridge API

## Operational excellence

### Documentation

- keep one source of truth for setup
- add a full Windows setup guide for voice prerequisites
- add troubleshooting for microphone privacy, TTS voices, and bridge failures
- add an architecture diagram for `Core`, `Bridge`, and `Voice`
- add a release checklist before each major milestone

### Release discipline

- define milestone tags: `alpha`, `voice-alpha`, `desktop-alpha`, `beta`
- introduce a changelog or release notes discipline
- add quality gates before tagging a release
- require smoke checks before merge to main for major runtime changes

### Observability

- add structured logs for bridge requests and voice actions
- add optional local event traces for debugging
- track latency for STT, bridge, model response, and TTS separately
- track failure rates for microphone, grammar, TTS, and bridge startup

## Professional execution order

### Track A: Stabilize what already exists

- install Bun
- complete build verification
- smoke-test core, bridge, TTS, STT, and PTT
- persist bridge sessions
- clean up docs and configuration

### Track B: Improve operator quality

- add better diagnostics
- add better session restore
- improve voice response shaping
- improve TTS and STT ergonomics
- add desktop shell prototype

### Track C: Expand capabilities

- add wake-word research spike
- add desktop presence
- add richer automation
- add memory and personalization
- unify more of the Rust runtime with the production path

## Definition of done for the next serious milestone

The next milestone should not be considered complete until all of the following are true:

- `Sentinel Core` builds locally without manual patching
- `sentinel-bridge` starts reliably
- bridge sessions persist across restarts
- `sentinel-voice` can do text, TTS, STT, and push-to-talk on Windows
- `voice doctor` gives actionable setup information
- known blockers are documented and reproducible
- the main product can be demoed end-to-end without hand-waving
