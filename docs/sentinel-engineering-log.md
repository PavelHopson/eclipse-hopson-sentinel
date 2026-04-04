# Sentinel Engineering Log

This document records blocked checks, failed attempts, and known limitations during the build-out of `Eclipse Hopson Sentinel`.

## 2026-04-03

### Verified progress

- added the first localhost `Sentinel Bridge` API
- added the first external `Sentinel Voice MVP` text client
- documented the bridge and MVP client flow
- added a stable `voice-v1` response envelope for external clients
- added bridge-managed dialogue sessions backed by the inherited Sentinel `--resume` flow
- added local Windows TTS output for `Sentinel Voice MVP` via `SAPI.SpVoice`
- added a one-shot Windows STT path for `Sentinel Voice MVP`
- added a terminal-safe push-to-talk mode layered on top of one-shot STT
- added a standalone `voice doctor` diagnostic flow

### What did not succeed yet

- embedding `voice doctor` directly into the Node client hit `spawn EPERM` in this environment, so the reliable path is currently the standalone PowerShell script instead
- `npm run build` could not be completed on this machine because `bun` is not currently installed or not available in `PATH`
- end-to-end runtime verification of the new bridge and voice client is still pending until Bun is installed and the core build is runnable locally

### Current known limitations

- `Sentinel Voice MVP` now supports TTS, one-shot STT, and terminal push-to-talk, but not continuous background voice operation
- no wake-word/background listener exists yet
- the bridge currently shells out to the non-interactive CLI instead of using a richer native session API
- the new `voice-v1` contract is designed from code inspection and partial local validation, but not yet fully smoke-tested end-to-end because the Bun-based build is still blocked
- bridge sessions are currently in-memory only, so they disappear when the bridge process stops
- current TTS implementation is Windows-specific and depends on local SAPI voices being installed
- current STT path is Windows-specific and depends on microphone permissions plus local speech recognition availability
- current push-to-talk flow is terminal-driven, not a global hotkey listener

### Environment-specific blockers seen locally

- on this machine the STT engine can be constructed, but microphone binding currently returns `Access denied`, so real microphone capture still needs Windows privacy permission to be enabled

### Next engineering targets

- install and verify Bun in the local environment
- run `npm run build`
- smoke-test `/sentinel-bridge`
- smoke-test `bin/sentinel-voice`
- design a richer response contract for voice-friendly replies
