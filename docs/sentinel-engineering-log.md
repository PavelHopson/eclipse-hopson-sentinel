# Sentinel Engineering Log

This document records blocked checks, failed attempts, and known limitations during the build-out of `Eclipse Hopson Sentinel`.

## 2026-04-03

### Verified progress

- added the first localhost `Sentinel Bridge` API
- added the first external `Sentinel Voice MVP` text client
- documented the bridge and MVP client flow

### What did not succeed yet

- `npm run build` could not be completed on this machine because `bun` is not currently installed or not available in `PATH`
- end-to-end runtime verification of the new bridge and voice client is still pending until Bun is installed and the core build is runnable locally

### Current known limitations

- `Sentinel Voice MVP` is text-only and does not yet capture microphone input
- no TTS pipeline exists yet
- no wake-word/background listener exists yet
- the bridge currently shells out to the non-interactive CLI instead of using a richer native session API

### Next engineering targets

- install and verify Bun in the local environment
- run `npm run build`
- smoke-test `/sentinel-bridge`
- smoke-test `bin/sentinel-voice`
- design a richer response contract for voice-friendly replies
