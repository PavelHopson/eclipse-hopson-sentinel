# Sentinel Engineering Log

This document records blocked checks, failed attempts, and known limitations during the build-out of `Eclipse Hopson Sentinel`.

## 2026-09-18

### Qwen3.8 Cyber IQ4_XS Lab integration

- Added the `qwen3.8-cyber-iq4xs:27b` model entry to the isolated Ultron Lab inventory. The live voice profile remains pinned to `qwen3:8b`.
- Added an explicit PowerShell installer that downloads the non-MTP GGUF from Hugging Face, verifies SHA-256 `d11d28b9b253fb7fc9de277a46af5bbd790c000d6bfdfe5648fd7b62ec2560b7`, and imports it into the loopback Lab Ollama store.
- Configured the import defaults at `num_ctx=8192` and `num_predict=4096`; installation and smoke benchmarking remain pending. The advertised 262K context remains an unpromoted architectural claim until local hardware measurements are recorded.
- Kept the model text-only: the matching vision projector is a separate artifact and the current dashboard has no image input contract.
- Kept the model outside Sentinel Core tools, secrets and Operator authority because the publisher describes it as de-refusal/abliterated and cyber/offensive-security oriented.

## 2026-08-24

### Embedded desktop usage guide

- Bumped the desktop patch release to `1.1.1` so the guide-enabled installer is distinguishable from the installed `1.1.0` build.
- Added a first-run quick-start dialog that routes directly to model settings, local Chat and Safe Operator.
- Kept the guide permanently discoverable from the sidebar and compact header after its automatic first display.
- Limited copy to implemented behavior: Ollama chat plus three approved read-only Operator skills; no file writes, shell, network or autonomous PC-control claims.
- Added modal semantics, Escape close, Tab containment, focus restoration, bounded scrolling and responsive layouts.
- Added a focused static regression test for discoverability, capability claims and accessibility contracts.

## 2026-08-23

### Eclipse Forge desktop and installer visual system

- Replaced the generic orb treatment with an original reusable Eclipse Forge mark and shared graphite, signal-blue and forge-gold tokens.
- Reworked the Jarvis shell, sidebar, Chat empty state, Safe Operator copy, settings dialog and status surfaces while preserving the existing authority and provider behavior.
- Added keyboard-reachable session selection, focus-visible message actions, Escape-close dialog behavior, mobile new/settings actions and a breakpoint that protects Command Room width at 1280px.
- Added a deterministic PowerShell generator for 24-bit NSIS sidebar/header bitmaps and a 256px ICO; the generator downloads nothing and uses only first-party geometry and system fonts.
- Switched to a bilingual assisted NSIS flow with branded header, sidebar, application, installer, uninstaller, window and tray assets.
- The default electron build initially hit repeatable Defender/AV `EPERM` locks while renaming freshly downloaded Electron archives. Packaging from the already installed lockfile-pinned `node_modules/electron/dist` completed and is now the reproducible project command.
- Real installer QA confirmed Russian install-mode localization and the branded header. Real packaged Electron QA exposed the early 1280px status-rail breakpoint; it was moved to the 2xl layout.
- Public release remains blocked by absent Windows code signing and the existing provenance/redistribution review.

### Dependency and release-surface verification

- Upgraded the desktop release surface to Electron 41.10.3, electron-builder 26.15.0 and Vite 8.2.2; removed the unused deprecated `electron-packager` dependency.
- Verified the dashboard production build and root Sentinel build, plus the supported-contract typecheck and 65 focused Office/operator/security tests.
- Verified zero dashboard npm advisories and zero production Bun advisories after the dependency refresh.
- Split the 506.12 KiB dashboard JavaScript bundle by existing Chat and Voice surfaces; the largest emitted chunks are now 282.76 KiB and 211.98 KiB, with no Vite chunk warning.

### Sentinel → Eclipse Chat Office Core P1d

- Added a minimized Office lifecycle projection and bounded in-memory outbox after the authoritative
  Safe Operator result; projection or transport failures cannot change the local receipt.
- Added the canonical `office.event.v1` mapper and a separate HMAC-signed atomic HTTP ingest client.
- The client enforces an exact origin allowlist, 64 KiB/50-event limits, timeout, at most three
  attempts, exact workspace matching and strict persisted-response validation without error-body logging.
- Added a typed Windows Credential Manager boundary and prompt-only CLI for provision/read/status/confirmed delete. Secrets stay out of argv, receipts, logs, renderer IPC and Git; concurrent provision is serialized by a scoped mutex and cannot overwrite an existing credential.
- Added a staged dual-key credential rotation contract and CLI: the next key uses hidden input, the current key is preserved, secret reuse and case-insensitive key collisions fail closed, postconditions are rechecked, and retirement remains a separate confirmed delete. A live Windows Credential Manager test staged two isolated random QA keys and removed both in `finally`.
- Ran a real Sentinel-to-Eclipse-Chat E2E against a temporary local PostgreSQL 18 cluster: after the first committed 2xx was deliberately lost, PostgreSQL restarted and the exact signed retry returned the original 200 with one event and one nonce row; the same nonce with a changed body returned 409.
- Windows harness bring-up initially exposed `--pwfile=-`, inherited `pg_ctl` pipes and shell-free `.cmd` spawn incompatibilities; the final harness uses an immediately zeroed/deleted temporary pwfile, exit-based pipe cleanup and the installed Prisma JS CLI.
- The E2E applied the real Prisma migration chain, used only generated test credentials and loopback HTTP, then left zero QA directories and zero QA PostgreSQL processes.
- Composed the Credential Manager client, canonical adapter and lifecycle into an explicit opt-in Electron main-process runtime. Invalid origin/key/workspace configuration, missing credentials and secret-like Office environment variables disable publication with bounded diagnostics and no renderer capability.
- Corrected lifecycle delivery accounting for the canonical adapter's `{ accepted: true }` result and covered the real signed publish path with an in-memory Office Core response.
- Chromium QA passed at 1440x900 and 390x844 with keyboard focus, visible mobile surface navigation, zero reduced-motion animations, zero horizontal overflow and zero console, page or request errors. Malformed provider-list entries and malformed SSE frames were ignored while the valid streamed response completed.
- No production credential or network endpoint was configured. Production provisioning and rotation remain an operations task.

### First real bounded operator path

- Added a shared deterministic safe-operator contract for Electron and the standalone CLI.
- Replaced the dashboard's simulated execution path with trusted, invoke-only Electron IPC; the browser fallback is labelled preview-only.
- Added exact-key validation, a fixed read-only skill allowlist, approval and plan expiry, replay protection, rate limiting, bounded receipts and a STOP-by-default one-shot control.
- Kept LLMs, arbitrary shell input, network access, file writes and secrets outside the authority path.
- Hardened Electron navigation/external-link handling and added a restrictive dashboard CSP.
- Added focused security and contract regression tests; the repository-wide dashboard ESLint run now passes.

## 2026-08-13

### CI truthfulness and TypeScript containment

- Made all 216 Bun tests blocking in CI and corrected the stale fail-closed BrowserRead assertion.
- Added strict typechecking for maintained, self-contained Eclipse contracts covering the browser
  capability policy, notify-only advertising anomaly detector and provider recommendation logic.
- Added a reproducible full-program debt audit. It records platform-specific ceilings: 3,995
  diagnostics on Windows and 4,291 on Linux CI. The Windows profile includes 517 `TS2307`
  diagnostics and 196 unique missing module specifiers, and fails CI if any aggregate grows.
- Kept repository-wide `strict` settings intact. No broad excludes, generated `any` stubs or false
  claim of a green full typecheck were introduced.
- Verified build, CLI smoke, private distribution guard, Windows Doctor, 216 Bun tests, 44 Python
  tests and a zero-advisory Bun audit.

### Remaining blocker

- The first public source snapshot omitted central message, transport, plugin and wizard contracts.
  Full strict restoration remains an XL reconstruction track and must use lawful, reviewable source
  rather than unverified mirrors of the disputed upstream code.
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

# 2026-08-03 — browser policy wired fail-closed

- Added `BrowserRead` to the real tool registry behind explicit isolation, telemetry-off,
  disabled upstream profile persistence, loopback endpoint, strong access-key and domain-allowlist configuration.
- Executor exposes only create tab, accessibility snapshot, stats validation and disposable
  close. It has no click/type/cookie/download/payment/publish surface.
- Every requested, returned and stats-observed HTTP URL is checked against the read-only policy;
  page output is labelled untrusted to preserve the planner/executor prompt-injection boundary.
- Camofox remains uninstalled. A separate container/network review and runtime smoke are still
  required before a production profile may enable the tool.
- Full strict typecheck remains at the pre-existing 3,982-error baseline; the new source adds no
  TypeScript errors. Bun tests remain blocked locally because `bun.exe` is not executable here.

# 2026-08-05 — read-only Windows Doctor

- Added a standalone Windows security posture audit with plain-language results and one bounded
  next action. It checks built-in Windows controls without admin-only mutations, network calls,
  third-party installers, kernel drivers or imported NtWarden code.
- Added the stable `windows-doctor-v1` JSON contract. Reports omit username, hostname, serial
  numbers, recovery keys, secrets and profile paths; file output occurs only with explicit `-Out`.
- Added a dependency-free synthetic self-test, Config Health coverage, documentation and a Windows
  CI gate. Missing commands or permissions remain `unknown` instead of producing false failures.

# 2026-08-25 — Eclipse Ultron desktop command center

- Added the original Eclipse Ultron user-facing identity without renaming the Sentinel runtime,
  repository, local storage or versioned IPC schemas.
- Rebuilt the desktop Operator around a visible state machine and central reactive core. The UI
  exposes plan, diff, approval, one-shot execution, blocked/error state and final receipt.
- Added a manual Motion switch and `prefers-reduced-motion` fallback. Continuous visual motion is
  restricted to compositor-friendly transform/opacity effects.
- Exposed the existing first-party Windows one-shot STT script through a new fixed Electron IPC
  channel. The renderer passes no arguments; the main process validates the sender, enforces one
  active session, rate and output limits, a process timeout and redacted error responses.
- Kept Electron browser microphone permissions fail-closed. Voice is explicit, local, bounded to
  twelve seconds and unavailable in browser preview.
- Updated first-run guidance, favicon, package display name and deterministic NSIS assets to the
  Eclipse crimson/graphite/silver palette. No third-party character art or protected franchise
  assets are included.
- Pinned Electron `userData` to the previous `Eclipse Sentinel` profile before app readiness so
  the Ultron product rename preserves local sessions, model choice and other existing settings.
- Verified the local Windows upgrade from registered Sentinel 1.1.1 to Ultron 1.2.0. NSIS moved
  the machine-wide installation to the approved `E:\ADMIN_HOPSON_PC\Программы\Eclipse Ultron`
  path, removed the old product directory, created desktop/Start Menu shortcuts and launched a
  responsive Ultron window. Microphone capture remains pending an explicit user button press.
- Diagnosed the first desktop voice smoke: Windows exposed zero `System.Speech` recognizers, but
  the previous adapter collapsed that dependency failure into a misleading `not recognized`
  message. The STT contract now selects an explicit Russian recognizer and distinguishes missing
  Speech capability, missing Russian language pack, microphone denial and genuine no-speech.

# 2026-08-25 — Local Whisper and isolated 27B Lab runtime

- Replaced the required Windows Speech dependency with verified portable `whisper.cpp b4938`
  CUDA binaries and the multilingual `large-v3-turbo-q5_0` model. Runtime, weights and temporary
  state live only under the approved `E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime` root.
- Verified published SHA-256 for the Whisper runtime, Whisper model and portable Ollama archive.
  Ollama also verified every downloaded 27B model blob before writing its manifest.
- Voice capture now uses an exact hidden child process, fixed Russian/VAD parameters, one active
  session, bounded time/output and memory-only stdout parsing. Audio persistence and transcript
  logs are absent. A real microphone smoke produced a Russian transcript through CUDA Whisper.
- Routed both Ultron Core and Chat microphone buttons through the same trusted desktop IPC. Chat
  fills the composer for human review unless the user explicitly selects the voice-question action.
- Added portable Ollama `0.32.15` on loopback `127.0.0.1:11435` with a separate E-drive model
  store. HuiHui Qwen3.8 27B is exposed only as an opt-in `Ultron Lab` chat profile without tools,
  shell, filesystem, secrets, network actions, install, deploy or operator execute.
- Installed model size is 16.52 GiB. The measured 8K pilot placed about 11.3 GiB on GPU and
  4.7 GiB in host memory. Cold load was 233.3 s; total first response 254.56 s at 8.2 tok/s.
  A warm request completed in 5.07 s at 6.98 tok/s. The model works but is not suitable as the
  default; `qwen3:8b` remains the practical primary profile.
- Focused security/product tests, dashboard lint, production build and zero-advisory production
  dependency audit passed. Installer rebuilt successfully, updated the approved E-drive Ultron
  installation with exit code 0, relaunched the desktop app and auto-started the verified portable
  Lab server on `127.0.0.1:11435` with the expected Q4_K_M model manifest.

# 2026-08-25 — persistent Ultron contact and repository presentation

- Added a persistent avatar contact dock across Chat and Ultron Core. It exposes one obvious
  voice action plus direct routes to both surfaces without starting the microphone implicitly.
- Voice capture reuses the fixed trusted Electron IPC contract. The original dictation path still
  fills the Chat composer for review; the new voice-question path sends only after the user selects
  the clearly labelled action.
- Added keyboard Escape recovery, outside-click close, disabled/browser states, live status copy,
  compact mobile layout and tiered reduced-motion behavior. Animation is limited to transform and
  opacity effects.
- Created original Eclipse Forge crimson/graphite/silver avatar and hero artwork with no protected
  franchise imagery, then captured the current product UI at desktop and compact breakpoints.
- Rebuilt the root README as the flagship product page while keeping the claims verifiable: current
  capabilities, explicit permission boundaries, measured 27B cold/warm performance, architecture,
  quick start, quality gates, documentation and unresolved signing/provenance constraints.
- Split the new Node desktop contracts from Bun auto-discovery after CI exposed a runner collision
  between concurrent `node:test` files under Bun 1.3.12. The contracts remain blocking in a separate
  `node --test` step; the existing Bun suite stays unchanged. Updated the UTF-8 rename assertion to
  the current `Eclipse Ultron Desktop` product copy.
- Narrowed the Office packaging regression from a blanket `process.env` ban to Office credential
  namespaces. This preserves the renderer/credential boundary while allowing the non-secret
  `ECLIPSE_AI_RUNTIME_DIR` path override used by the isolated local model runtime.

# 2026-08-25 — living voice assistant state machine

- Added one shared presence contract across Chat, the persistent contact dock and Ultron Core:
  idle, listening, thinking, speaking, success and error.
- Replaced the static avatar treatment with an original state-driven presence component. Breathing,
  scanning, orbit, signal and voice-bar effects use transform and opacity only; dense operator panels
  remain visually quiet.
- Added an explicit one-turn voice conversation. «Спросить голосом» captures one local Whisper
  transcript, sends it to the selected Chat model and speaks the bounded answer. «Только
  продиктовать» keeps the existing review-first composer path.
- Kept wake word, continuous listening, standing microphone permission and automatic follow-up
  capture absent. Every new spoken turn requires a separate click, and TTS has a visible Stop action.
- Centralized the Motion preference, subscribed to live Windows reduced-motion changes and disabled
  continuous loops when the system preference is active.
- Bounded browser TTS to 500 characters and 45 seconds, resolved interruption safely, and prevented
  stale speech events from completing a newer turn.
- Playwright production-preview QA passed at 1440x960 normal motion and 390x844 reduced motion with
  zero console/page errors and zero horizontal overflow. The mobile launcher was moved away from the
  primary bottom action and hidden while the contact panel is open.

# 2026-08-25 — FIFINE microphone capture compatibility

- Reproduced the installed voice failure outside the UI. `whisper-stream` discovered
  `Микрофон (2- fifine Microphone)`, but SDL WASAPI rejected the endpoint with
  `WASAPI can't initialize audio client: Параметр задан неверно`.
- Verified the same runtime, model and capture device with `SDL_AUDIODRIVER=directsound`.
  SDL opened the device as the exact Whisper input contract: 16 kHz, mono, float audio.
- Tuned the one-shot VAD threshold from `0.60` to `0.45` for ordinary USB-microphone
  speech while staying above the `0.35` level that produced a noise false positive.
- Pinned `directsound` only inside the trusted one-shot Whisper child process. No renderer input,
  background capture, audio persistence or additional microphone authority was introduced.

# 2026-08-25 — conversational voice path inside Ultron Core

- Reproduced the UX mismatch after STT recovery: `Сказать команду` only populated the operator
  textarea, so a conversational question looked unanswered even though recognition succeeded.
- Made `Спросить Альтрона` the primary Core voice action. Its one-shot transcript routes through
  the existing Chat turn and bounded TTS path, so the answer is both visible and spoken.
- Kept `Продиктовать команду` as a separate secondary action. It only fills the read-only operator
  form; plan, approval, STOP release and execution remain separate human-controlled stages.

# 2026-08-25 — voice-first Ultron surface

- Removed the visible Chat, session sidebar, status rail and floating contact dock from the current
  product shell. The primary surface is now a central living avatar with one explicit voice action.
- Fixed a state race where a successful STT result could be discarded while React still considered
  capture active. The transcript now proceeds directly to the local model and bounded TTS.
- Pinned live voice to `qwen3:8b` on `127.0.0.1:11434`. Experimental 27B selections stored by older
  builds cannot replace or delay the live assistant.
- Kept the last transcript and answer visible for recovery while removing every text input from the
  conversation surface. Safe Operator remains a separate mode for reviewable actions.
- Added responsive stage, listening/thinking/speaking animation, disabled/error states and an explicit
  reduced-motion path. Playwright passed at 1440x960 and 390x844 with zero overflow or browser errors;
  the reduced-motion run exposed zero continuous animations.
- Reviewed OrcaRouter FP8/GGUF and AEON BF16 Qwen3.8 27B releases. Native FP8/BF16 are incompatible
  with the 16 GiB VRAM target; only the pinned OrcaRouter Q4 GGUF is approved as an isolated Lab
  research candidate. No abliterated model receives tools or Operator authority.
- Installed the pinned OrcaRouter Q4_K_M build in the E-drive Ollama Lab runtime. Ollama completed
  SHA-256 verification and registered digest `6e33a17b4eac0310b9bef6f005815e68d41b72f4ddaaa7c04fdca80245239b7b`
  (17,741,872,653 bytes). Promotion remains blocked on a recorded comparison benchmark.

# 2026-08-25 — faster configurable Ultron voice

- Replaced the unpredictable first available Russian browser voice with a deterministic preference for
  installed `Microsoft Pavel`, using a deeper 0.82 pitch and 1.20x speaking rate by default.
- Added a local Russian voice inventory, persistent bounded rate control and an explicit preview button in
  Settings. Chromium now waits briefly for asynchronous OneCore/SAPI voice discovery before the first reply.
- Reduced perceived response latency by warming fixed `qwen3:8b` again when capture starts, extending its
  keep-alive to two hours, limiting conversation context to the last eight messages and bounding voice replies
  to 160 tokens with a one-to-two-sentence system contract.
- Kept all voice preferences local. No cloud TTS, voice cloning, background microphone capture or new system
  installation was introduced. MOSS-TTS-Nano ONNX remains a separately benchmarked E-drive candidate.

# 2026-08-25 — explicit live conversation and fast neural voice

- Added an opt-in persistent `whisper-stream` session with fixed executable/model/DirectSound arguments.
  Start, pause, resume and stop are separate no-argument trusted IPC capabilities; stdout is bounded,
  duplicate transcripts are suppressed and no `--save-audio` path exists.
- Made live microphone authority visible on the primary button and tray. Ultron ignores transcript events
  while thinking/speaking, applies an echo guard before resuming and stops the process on explicit stop or exit.
- Reduced perceived model latency by speaking each completed sentence while remaining tokens stream. The
  spoken answer is still limited to the fixed `qwen3:8b`, 120 tokens and the last eight messages.
- Installed portable uv/Python/Qwen3-TTS strictly below `Eclipse AI Runtime` and verified CUDA on the RTX 4060 Ti.
  Evidence rejected Qwen3-TTS 0.6B as a real-time default: warm 2.96-second audio required 13.21 seconds;
  the first 9.04-second sample required about 62 seconds. No Qwen TTS server is auto-started by the app.
- Installed the official MIT Piper Windows runtime and two CC0 Russian voices. Voice files matched official
  `voices.json` MD5 values; Microsoft Defender found no threats in the runtime. `denis-medium` was selected
  for its lower measured median pitch and generated 5.39 seconds of audio in 0.67 seconds.
- Added bounded Piper IPC: fixed relative model/espeak paths, UTF-8 stdin, memory-only WAV stdout, 400-character
  input, 12 MiB output, 8-second timeout, one process, rate limit, RIFF/WAVE validation and cancellable fallback.
  Windows SAPI remains a deterministic fallback when the E-drive runtime is absent.
