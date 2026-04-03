# Eclipse Hopson Sentinel Roadmap

## Phase 1 — Rebrand Foundation

- rename user-facing project surface to `Eclipse Hopson Sentinel`
- add `sentinel` launcher
- preserve compatibility shims during transition
- prepare repository for GitHub rename

## Phase 2 — Stabilize Sentinel Core

- validate TypeScript runtime build and startup
- validate Rust runtime build and startup
- choose the practical default runtime for daily use
- clean up remaining inherited branding in user-facing surfaces

## Phase 3 — Core Bridge API

- add a localhost bridge for external clients
- define JSON request/response schema
- support prompt execution and structured results
- prepare integration for voice and desktop shells

## Phase 4 — Sentinel Voice MVP

- create separate voice shell module or repository
- start with text bridge client
- add TTS
- add STT
- add wake word

## Phase 5 — Operator Experience

- define assistant persona and modes
- create desktop control surface
- add memory, session restore, and voice shortcuts
- tune latency and local/offline profiles

## Phase 6 — Full Local Operator

- coding help
- system automation
- project navigation
- voice-driven workflows
- local and cloud model routing
