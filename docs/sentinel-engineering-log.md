# Sentinel Engineering Log

This document records blocked checks, failed attempts, and known limitations during the build-out of `Eclipse Hopson Sentinel`.

## 2026-07-31

### Verified progress

- restored 125 SDK core aliases and 41 control-protocol aliases directly from the
  repository's existing Zod schemas
- restored normalized SDK usage/settings helpers, query-source and immutable utility types,
  build macro declarations, and an ES2023 TypeScript library baseline
- reduced strict typecheck errors from 4,504 to 3,982 without excluding files, relaxing
  `strict`, or adding broad `any` declarations
- completed a Bun production build and focused provider tests after the changes
- disabled auto-update and npm publish paths for the private distribution

### High-risk provenance finding

- Gitlawb/openclaude now states that its base layer derives from proprietary Anthropic
  Claude Code code and that the project does not have authorization to distribute that
  underlying source
- Sentinel's initial import did not record the exact upstream commit, so repository-wide
  MIT redistribution cannot be supported by the current evidence
- `package.json` is now private and the repository license explains the unresolved boundary

### Remaining blocker

- 517 strict errors are unresolved module imports; 177 of those reference the missing central
  message contract and 17 reference the missing tool-progress contract
- missing internal modules must not be reconstructed from unofficial mirrors until provenance
  and redistribution rights are established

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
- added persistent bridge session storage on disk
- added a deterministic `Sentinel Config Health` audit inspired by the strongest ideas from `ai-setup`
- added local deterministic Sentinel backups for key config and voice surfaces
- added a first Windows installer flow with dry-run support

### What did not succeed yet

- embedding `voice doctor` directly into the Node client hit `spawn EPERM` in this environment, so the reliable path is currently the standalone PowerShell script instead
- `npm run build` could not be completed on this machine because `bun` is not currently installed or not available in `PATH`
- end-to-end runtime verification of the new bridge and voice client is still pending until Bun is installed and the core build is runnable locally

### Current known limitations

- `Sentinel Voice MVP` now supports TTS, one-shot STT, and terminal push-to-talk, but not continuous background voice operation
- no wake-word/background listener exists yet
- the bridge currently shells out to the non-interactive CLI instead of using a richer native session API
- the new `voice-v1` contract is designed from code inspection and partial local validation, but not yet fully smoke-tested end-to-end because the Bun-based build is still blocked
- current TTS implementation is Windows-specific and depends on local SAPI voices being installed
- current STT path is Windows-specific and depends on microphone permissions plus local speech recognition availability
- current push-to-talk flow is terminal-driven, not a global hotkey listener
- restore currently overwrites tracked Sentinel surfaces directly and should be used carefully until a safer interactive restore flow exists

### Persistence notes

- bridge sessions are now stored in `.sentinel/bridge/sessions.json`
- persistence is local and file-based for simplicity and debuggability
- session TTL and cleanup are not implemented yet

### Environment-specific blockers seen locally

- on this machine the STT engine can be constructed, but microphone binding currently returns `Access denied`, so real microphone capture still needs Windows privacy permission to be enabled

### Next engineering targets

- install and verify Bun in the local environment
- run `npm run build`
- smoke-test `/sentinel-bridge`
- smoke-test `bin/sentinel-voice`
- design a richer response contract for voice-friendly replies
# 2026-08-02 — guarded browser and advertising operators

- Added standalone, dependency-free browser capability policy: public HTTPS allowlist, private
  IPv4/IPv6 and URL-credential rejection, no cookies/telemetry, no browser mutations.
- Added read-only advertising spend anomaly detection with a bounded input and `notify_only` output.
- Added focused tests and a deployment boundary document. These contracts are not yet wired into
  the inherited planner; production enablement remains a separate reviewed step.
