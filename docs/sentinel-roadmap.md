# Eclipse Hopson Sentinel Roadmap

## Decision / Recovery / Shadow-Canary — read-only сверка 2026-10-09

Отдельный поток: Backlog 30–32 / Agent OS 103–105. Этот статус не подтверждает голосовой runtime или Codex Gateway; их реализация здесь не менялась. Исторические записи ниже сохранены.

- Локальный `main`: `1268cf9d9a1dc1c0cd35f5dcb14d76fceb8a5a05`, ahead 3 / behind 18 относительно `origin/main`; есть чужие незавершённые изменения. GitHub main и имеющийся origin/main: `ffb846615dfcd1fa887aacc4ea748c981a87e604`. Merged-файлы этого потока отсутствуют в текущем checkout; изучены через существующие Git objects, без pull/checkout/reset.
- PR [#19](https://github.com/PavelHopson/eclipse-hopson-sentinel/pull/19), [#20](https://github.com/PavelHopson/eclipse-hopson-sentinel/pull/20), [#21](https://github.com/PavelHopson/eclipse-hopson-sentinel/pull/21), [#22](https://github.com/PavelHopson/eclipse-hopson-sentinel/pull/22) merged. Merge SHAs соответственно: `47868b04c648c3b3ca5563f3e4162ec0617b6893`, `6422f3c5507e86b2a94253bc948fdca96d47ce99`, `2a6ab0f6dcf48d0cd2c1c54ce718c84ea70efd84`, `ffb846615dfcd1fa887aacc4ea748c981a87e604`.
- На точном ffb8466 [CI 35614844369](https://github.com/PavelHopson/eclipse-hopson-sentinel/actions/runs/35614844369) и PR Checks 35614844363 успешны. Проверены статусы jobs и исходники synthetic/contracts. Локально merged-тесты в этой сверке не перезапускались; зелёный CI не является live-provider или production доказательством.

| Существующий пункт | Реализовано и проверено по merged-коду/CI | Runtime и следующий блокер |
|---|---|---|
| Backlog 30 / Agent OS 103 — Decision Layer | Контракты, structured-output adapter, synthetic corpus 18 случаев, evidence persistence/provenance; PR #22 переводит manual baseline на OpenAI | После #22 успешного live baseline нет. Нужен отдельно разрешённый запуск preflight и корпуса на точном согласованном main; наличие ключа не проверялось. Execution authority не предоставлена. |
| Backlog 31 / Agent OS 104 — Recovery Controller | Supervised state machine; append-only sidecar; bounded reader; opt-in observer tool batches; read-only operator diagnostics | Код observer не доказывает, что он включён в runtime. Автоматические retry/rollback/control-flow не разрешены. Нужен отдельный согласованный runtime-сценарий; реальные session payloads не читались. |
| Backlog 32 / Agent OS 105 — Shadow/Canary | Synthetic observer → session → sidecar → reader → summary: healthy / checkpoint / replan; comparison gate блокирует regressions и всегда оставляет canaryAuthorized=false | Нет достоверного baseline/candidate сравнения и разрешения на canary. Следующий безопасный шаг — согласовать checkout с сохранением dirty work и повторить offline harness; live/canary требует отдельного допуска. |

Последний [baseline run 35613001871](https://github.com/PavelHopson/eclipse-hopson-sentinel/actions/runs/35613001871), SHA `2a6ab0f6dcf48d0cd2c1c54ce718c84ea70efd84`, завершился **failure на preflight**: corpus/validation/upload skipped, артефактов нет. После #22 нового запуска не найдено.

Единственный сохранённый артефакт `decision-baseline-35598298973`, ID **10640520390**, относится к [старому run 35598298973](https://github.com/PavelHopson/eclipse-hopson-sentinel/actions/runs/35598298973) и SHA `3e2674dc6e9d6a875b5e06a6b5eb6b10da8ddca2`. ZIP SHA-256 `21819138239777e1078c52ddc6e3d9ffd872b209cc97f7a1e8f682c31de27939` проверен; внутри `baseline-20260921T130537369Z.json`, schema `sentinel.decision-shadow-report.v1`, engine `sidequery:github`, model `github:copilot`: **18 случаев, 0 valid, 0 correct, 0 accepted, invalidRate=1**. Все bounded errors: `decision engine failed`. Успешный статус старого workflow подтверждает лишь выпуск отчёта, не работоспособность inference и не пригодный baseline. Его почти нулевые latency не являются измерением скорости модели.

В этой сверке не запускались live workflow/provider, observer, canary, установка, смена моделей/default/authority, commit/push/deploy. Codex Gateway не изменён. Google-реестр ведёт координатор; здесь он не обновлялся.

## Voice recovery + HuiHui admission 1.2.23 — 2026-09-12

- [x] reproduce inconsistent cold-load/first-decode readiness and add bounded technical warmup
- [x] bound renderer TTS stages and expose a no-microphone **Проверить ответ** action
- [x] preserve exact Developer model allowlist, human approval and CPU-only Lab separation
- [x] pass 156 voice/security tests, 3 native lifecycle tests, typecheck/lint/build and mocked desktop/mobile QA
- [x] verify author HuiHui UD-DW Q4_K_M source, normalized tensor equality and local registration
- [x] complete synthetic CPU-only Developer proposal (173.075s, ~16GiB RAM, 0 GPU bytes) and verify owned cleanup
- [x] package/verify/install isolated 1.2.23 on E:; retain 1.2.22 rollback
- [ ] confirm actual speaker output, multi-turn microphone/resume and Stop with user

Current evidence and blockers: [2026-09-12 recovery](ultron-recovery-2026-09-12.md).

## TTS diagnostics 1.2.22 (installed; short audible retry confirmed) - 2026-09-08

- [x] confirm from user screenshot that STT and text answer succeed; failure is in speech output
- [x] reproduce numeric/word/sentence synthesis successfully with installed helpers in Node and Electron, no mic/playback
- [x] replace blanket TTS error with fixed Piper/DSP/config/cancellation codes, without exposing native payloads
- [x] pass 150 voice tests, syntax/typecheck/lint/build, mocked desktop/mobile live-flow QA and ASAR isolation checks
- [x] install/restart approved voice-only 1.2.22 on E:, verify exact version and ASAR hash; retain 1.2.21 rollback
- [x] user confirmed audible retry after update/restart: "Он заговорил"
- [ ] verify multi-turn live conversation/resume/Stop; exact cause of the prior running-app TTS failure remains unproven

Evidence: [voice recovery status](ultron-voice-readiness-2026-09-08.md).

## Voice recovery hotfix 1.2.21 (installed; human incident still open) - 2026-09-08

- [x] separate cancellable model preload from the first-answer deadline; preserve independent microphone startup
- [x] retain Whisper ownership through failed termination, expose Stop retry and fix resume-before-ready
- [x] retain burst/duplicate/silence guards while allowing natural nine-turn conversations
- [x] strip unnecessary capture environment; include packaged GUI host in diagnostics
- [x] pass 147 voice/security tests, 3 native lifecycle tests, lint, supported typecheck and web build
- [x] add CI coverage for voice session/host and native Windows lifecycle
- [x] run isolated real model/TTS smoke with no visible console SHOW events
- [x] verify/install voice-only candidate on E: without releasing the separate AI Hub Task Ledger
- [ ] pass human multi-turn microphone/audio/Stop test: user reports no response and no visible error
- [x] local non-speech-symbol filtering regression fix, 149 tests passed; not yet installed
- [ ] verify bounded control-phrase capture before further release; previous one-shot ended on unrelated short fragment

Evidence and rollout status: [voice recovery](ultron-voice-readiness-2026-09-08.md).

## Follow-up audit — 2026-09-08

- [x] recheck installed 1.2.19 integrity, 137 voice tests, 13 task-journal tests, lint/typecheck/build and native model/TTS probes
- [x] P1: local fix separates cold model loading from first-answer budget; see hotfix rollout above
- [x] P1: local fix blocks repeat capture until actual child close, repairs early resume readiness and lifecycle fixtures

Evidence, remaining risks and scope: [audit 2026-09-08](ultron-audit-2026-09-08.md). No application changes or reinstall performed by this audit.

## Ultron 1.2.19 — proven console source and native VAD — 2026-09-05

- [x] trace visible Terminal events beyond desktop descendants to independent Ollama 0.32.15 GPU discovery
- [x] package a fixed GUI host with inherited headless console, bounded pipes and owned Job Object cleanup
- [x] unify one-shot/live Whisper capture, enable actual VAD and wait for native microphone readiness
- [x] bound and cancel native non-thinking voice requests; reject stale UI/status results
- [x] pass 137 voice/security tests, lint, supported typecheck, syntax checks and production build
- [x] build/install 1.2.19 on E:; verify installed version, ASAR hash and GUI subsystem host
- [x] confirm short human Russian question -> spoken "4"; actual installed chain observed with zero visible console events
- [ ] verify longer multi-turn conversation and user-driven Stop/tray/reopen lifecycle

Evidence and corrected earlier assumptions: [1.2.19 incident](ultron-1.2.19-console-and-voice-recovery.md).

## Ultron 1.2.18 — immediate listening and unified stop — 2026-09-05

- [x] trace the installed 1.2.17 process tree and separate Ultron children from Codex, Edge and Explorer shells
- [x] verify that the desktop shortcut launches the executable directly and that no repeated credential-helper loop occurs
- [x] start Whisper before the potentially slow Qwen readiness request; prepare the model in parallel
- [x] synchronize tray start/stop/emergency commands with renderer state and query authoritative state on renderer mount
- [x] stop capture, current model turn, TTS and pending local work when the window is closed to tray
- [x] terminate live Whisper through the exact owned Windows PID tree and keep all native spawns shell-free
- [x] explicitly hide the fixed Windows Credential Manager PowerShell helper
- [x] pass 126/126 voice/security tests, lint, supported typecheck, syntax checks, web build, zero-advisory dashboard audit and NSIS guard
- [x] build and locally verify the unsigned 1.2.18 installer and packaged ASAR
- [x] install 1.2.18 to the fixed E-drive program path; verify ProductVersion, matching ASAR and both shortcuts
- [ ] complete a human live phrase, audible answer, mid-generation Stop and no-console-flash smoke

## Ultron 1.2.17 — FIFINE sliding recognition recovery — 2026-09-04

- [x] verify Windows microphone consent, FIFINE endpoint presence and healthy input level (`-8 dB` peak)
- [x] reproduce zero VAD blocks at thresholds `0.45` and `0.20` with the installed whisper-stream build
- [x] verify the same build emits sliding-window redraws and known silence hallucinations
- [x] require two matching bounded redraws before a live or one-shot transcript can become a command
- [x] preserve silence filters, echo guard, duplicate suppression, rate circuit breaker and no-audio-retention boundary
- [x] extend the Primary Ollama readiness window for the measured Windows startup race without duplicate processes,
  startup microphone activation, model downloads or 27B loading
- [x] pass real local model (`81.487 s` cold) and protected TTS (`842 ms`) smokes; retain cold-load latency as an
  explicit product limitation
- [x] pass 125/125 voice/security tests, lint, supported typecheck and web build; build and verify 1.2.17,
  then install it to the fixed E-drive path after an explicit preview
- [ ] complete a human spoken-phrase and audible-response check

## Ultron 1.2.16 — Windows STT encoding hotfix — 2026-09-01

- [x] reproduce the failure in the exact installed Windows PowerShell 5.1 parser
- [x] identify UTF-8-without-BOM mojibake as the pre-Whisper parser failure
- [x] encode the packaged STT wrapper with UTF-8 BOM and request a hidden PowerShell window explicitly
- [x] add a byte-level and native PowerShell parse regression test
- [x] build and install 1.2.16 to the fixed E-drive path; verify the installed BOM, version and unchanged Ollama PID
- [ ] complete a real spoken-phrase and audible-response check from the user-launched desktop shortcut

## Ultron 1.2.15 — process lifecycle fail-safe — 2026-09-01

- [x] inspect the live Windows process tree without stopping unrelated terminals, media or Ollama
- [x] enforce one desktop instance and focus the existing window on a repeated launch
- [x] bind one-shot STT cancellation and timeout to the exact PowerShell + Whisper process tree
- [x] expose a tray emergency stop for live STT, one-shot STT, TTS, pending voice action and Developer proposal
- [x] stop live capture after eight anomalous transcript deliveries in sixty seconds
- [x] add regression/security coverage for exact PID-tree termination, no shell and circuit-breaker behavior
- [x] build the unsigned 1.2.15 installer and verify ASAR contents, version, SHA-256, installer process guard and voice ACL guard without installing it
- [x] install 1.2.15 after explicit operator approval; verify exact ASAR, registry, shortcuts, real single-instance behavior, idle helper absence and unchanged Ollama PID
- [ ] complete the human spoken-phrase and audible TTS check in the held application session (automated GUI launch jobs close their children on completion)
- [ ] attribute any future visible console window from a captured PID/PPID/command-line snapshot; current evidence did not attribute one to Ultron

## Ultron 1.2.14 — FIFINE VAD hotfix — 2026-08-31

- [x] reproduce the false phrase `Продолжение следует…` from quiet live capture and classify it as a Whisper silence hallucination, not user speech
- [x] pin the only enumerated DirectSound capture endpoint (`FIFINE`, device `0`) for one-shot and live recognition
- [x] move production live recognition from sliding redraws to completed VAD framing; reject unframed output and two exact common silence artifacts
- [x] show an actionable gain/input-level hint after twelve seconds without recognized speech, without storing or uploading audio
- [x] pass focused and full voice/security regression suites
- [x] isolate the remaining screenshot failure to TTS after verified STT and Qwen response; recreate the fixed capability-free AppContainer profile and pass a real 837 ms installed-runtime smoke
- [ ] run human spoken-phrase calibration after increasing FIFINE hardware gain and Windows input level
- [ ] confirm audible playback in the interactive application, then remove the empty AppContainer recovery directory
- [x] superseded by the installed 1.2.15 build containing the 1.2.14 microphone fixes

## Ultron 1.2.13 — fast voice and runtime diagnostics — 2026-08-31

- [x] consolidate the existing `qwen3:8b` blobs into the canonical E-drive model store with size/SHA-256 verification and same-volume hardlinks; preserve the source store
- [x] pin both Primary and Lab profiles to the reviewed E-drive store so stale environment values cannot redirect desktop inference to C: or a legacy path
- [x] replace the five-minute CPU Qwen3-TTS production path with pinned Piper + Ultron DSP; keep Qwen3-TTS as non-realtime Studio/Lab evidence
- [x] add a read-only diagnostics dialog for storage, Whisper, pinned Piper artifacts, Primary/Lab models and media resource guard
- [x] move Chromium cache and Ultron logs below `Eclipse AI Runtime` on E: while preserving the stable Chromium user-data migration boundary
- [x] cover loading/error/success, keyboard focus, Escape, mobile and reduced-motion states; browser QA has zero external requests, console errors or horizontal overflow
- [x] build the assisted Windows installer and run non-mutating NSIS process/ACL guards
- [x] install 1.2.13 after explicit operator confirmation; verify ProductVersion, ASAR/helpers, startup, shortcut and unchanged Ollama PID
- [ ] reduce the 175.803 s observed cold Qwen 8B load without auto-warming on app startup or regressing media playback; warm/re-cached load is 5.511 s
- [ ] record human microphone, audible voice quality and simultaneous local video-playback QA on the installed build
- [ ] sign the installer before public distribution

## Bounded Developer Mode and resource governor — 2026-08-31

- [x] add native Git workspace selection with a read-only, text-only, secret-aware context boundary
- [x] generate a schema-bound 27B proposal on loopback without tools, shell, network or renderer-controlled model/path arguments
- [x] add explicit cancellation for long cold proposals; cancellation returns no partial diff and still runs unload/owned-server cleanup
- [x] require an expiring exact approval before atomic file replacement; return receipt and conflict-safe rollback preview
- [x] prevent prompt/file output from expanding the path allowlist or introducing secret-like values
- [x] remove primary/Lab model warm-up from application startup; reduce explicit voice keep-alive from two hours to five minutes
- [x] run Developer inference with `think=false`, CPU-only six threads, bounded 8K context and `keep_alive=0`; block concurrent voice/TTS heavy work
- [x] move Whisper, Hugging Face and HyperFrames cache assets from C: to the E-drive runtime with compatibility junctions
- [x] redirect future Ollama/HF/Whisper/npm/pip/Electron caches to `E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime`
- [x] remove 13.04 GiB of exact, re-downloadable caches/install archives without scanning or changing personal media/doc roots
- [x] run the first real OrcaRouter Q4 Developer smoke on an artificial Git fixture: 168.08 s cold end-to-end, valid one-file diff, no apply, zero model left in `/api/ps`
- [ ] record a simultaneous local video-playback QA; current GPU/RAM evidence is safe but is not a playback test
- [ ] evaluate adding new files only after a separate path/create policy and regression suite; current MVP modifies existing context files only

## Voice-first Ultron — 2026-08-25

- [x] remove the visible text Chat, session sidebar, status rail and floating contact dock from the primary desktop shell
- [x] make the living Ultron avatar and one explicit `Включить живой разговор` action the central product surface
- [x] pin live conversation to local `qwen3:8b` so stored experimental model choices cannot slow or replace voice replies
- [x] show the last recognized phrase and spoken answer without exposing a text composer
- [x] keep Safe Operator as a separate secondary mode with dictation, plan, diff, approval, STOP and receipt
- [x] preserve one-shot capture and add an explicit cancellable live session; keep wake word, startup capture and standing authorization absent
- [x] keep one persistent Whisper process during live mode, pause transcript delivery during TTS and suppress immediate echo/duplicates
- [x] start speaking after the first complete generated sentence instead of waiting for the full model response
- [x] replace the robotic SAPI default with bounded Piper Denis IPC; retain Windows TTS only as fallback
- [x] eliminate Windows Piper stdout corruption with validated ephemeral E-drive WAV transport and startup cleanup
- [x] switch the clean TTS transport to the lower Piper Denis `Brutal` profile without renderer pitch processing
- [x] add the first least-privilege voice action: fixed YouTube preview -> manual approval -> browser dispatch -> receipt
- [x] install and benchmark Qwen3-TTS 0.6B on E:, then exclude it from real-time default after measured 13.21-second warm latency
- [x] verify desktop normal-motion and mobile reduced-motion layouts with zero overflow and browser errors
- [x] evaluate OrcaRouter and AEON Qwen3.8 27B variants against hardware, provenance and safety boundaries
- [ ] benchmark the OrcaRouter Q4 candidate in isolated Lab before deciding whether it supersedes HuiHui

## Living voice assistant — 2026-08-25

- [x] introduce one shared `idle / listening / thinking / speaking / success / error` presence contract
- [x] animate the avatar, launcher and Ultron Core from real product state instead of decorative timers
- [x] add both one-turn and explicit live conversation: persistent STT -> fixed fast voice model -> bounded TTS
- [x] keep a separate dictation-only route for Operator review and editing
- [x] add visible stop-speaking and global Motion controls; honor live Windows reduced-motion changes
- [x] limit primary animation loops to compositor-friendly transform and opacity
- [x] verify desktop normal-motion and compact mobile reduced-motion flows with zero overflow or browser errors
- [x] fix FIFINE USB microphone capture by pinning the trusted Whisper child to SDL DirectSound
- [x] split Ultron Core voice UX into an obvious spoken question path and explicit operator dictation
- [x] add a local TTS voice inventory, Russian voice selection, bounded speed control and testable preview
- [x] evaluate local TTS candidates against the system Pavel baseline and select the lower Piper Denis profile for real-time latency; keep Qwen3-TTS as Studio/Lab evidence
- [ ] evaluate compact always-on-top mode without enabling wake word or background listening
- [ ] expand browser actions one capability at a time; every target needs a fixed policy, preview, manual approval and receipt

## Retired persistent contact experiment — 2026-08-25

This implementation was completed and tested, then intentionally superseded by the simpler
voice-first shell above. The dock and visible Chat are no longer primary product surfaces.

- [x] add an original first-party Ultron avatar without protected franchise artwork
- [x] keep one persistent contact dock visible across Chat and Ultron Core
- [x] provide two explicit one-shot routes: voice question with audible answer, or composer-only dictation
- [x] provide direct Chat/Core routes, visible local privacy copy and keyboard Escape recovery
- [x] cover desktop, compact mobile, focus and reduced-motion states
- [x] rebuild the repository README around verified capabilities, real measurements and current safety boundaries
- [x] add first-party hero, avatar and current product screenshot assets
- [ ] evaluate an optional always-on-top voice orb; keep background listening disabled by default

## Desktop first-run guidance — 2026-08-24

- [x] add a first-run quick-start dialog for the local model, Chat and Safe Operator paths
- [x] keep a persistent `Как пользоваться` entry in desktop and compact navigation
- [x] link every step to its real destination instead of relying on explanatory copy alone
- [x] document the current read-only capability boundary without implying autonomous PC control
- [x] add Escape close, focus containment/restoration, responsive overflow and reduced-motion compatibility
- [ ] replace the static model recommendation with a local Ollama inventory and one-click safe selection

## Eclipse Forge desktop visual system — 2026-08-23

- [x] replace the generic desktop orb with one original Eclipse Forge mark across shell, favicon, window and tray
- [x] unify Jarvis shell, sidebar, Chat, Safe Operator and Settings on graphite/signal-blue/forge-gold tokens
- [x] add keyboard-reachable session navigation, dialog semantics, quick-start empty state and mobile primary actions
- [x] keep reduced motion, focus visibility, loading, empty, error, success and disabled states explicit
- [x] build an assisted bilingual NSIS installer with first-party header/sidebar/icon assets
- [x] generate and validate exact 164x314/150x57/256x256 installer assets without external artwork or fonts
- [x] package from the lockfile-pinned local Electron distribution to avoid repeated Windows extraction locks
- [ ] sign the installer and application executable before any public distribution

## Desktop dependency hardening — 2026-08-23

- [x] upgrade Electron, electron-builder and Vite to advisory-free supported releases
- [x] remove the unused deprecated electron-packager release path
- [x] verify dashboard/root builds, supported-contract typecheck and focused Office/operator tests
- [x] split the 506.12 KiB dashboard JavaScript chunk into bounded 282.76/211.98/12.10 KiB route chunks

## Sentinel Office Core bridge — 2026-08-23

- [x] project Safe Operator lifecycle into a bounded, immutable, non-blocking local outbox
- [x] map minimized Sentinel projections to canonical `office.event.v1` inputs
- [x] add strict workspace, metadata and persisted-response validation
- [x] add canonical JSON plus HMAC-signed atomic ingest with origin, size and timeout limits
- [x] cover lost-response retry, 4xx stop, 5xx/timeout bounds and adapter integration
- [x] confirm durable same-nonce/same-request 2xx replay in local Eclipse Chat Office Core contract tests
- [x] add Windows Credential Manager provision/read/confirmed-delete and pass live PostgreSQL restart/replay end-to-end QA
- [x] compose Credential Manager, signed ingest, canonical adapter and lifecycle in the Electron main process behind explicit opt-in configuration
- [x] add a local staged dual-key rotation workflow with secret-reuse rejection, dual-key postcondition checks and explicit old-key retirement
- [ ] provision and rotate the real production producer credential through the deployment secret manager; no production secret is stored locally


## Safe Operator execution slice — 2026-08-23

- [x] replace the browser-only Command Room simulation with a real Electron IPC execution boundary
- [x] add deterministic Russian/English routing for three read-only local skills
- [x] validate versioned exact-key plan, approval and receipt contracts fail-closed
- [x] enforce plan/approval TTL, replay protection, rate limiting and a one-shot STOP control
- [x] add a standalone `sentinel-operator` CLI with optional existing Windows STT/TTS adapters
- [x] keep ordinary browser use explicitly preview-only instead of claiming native execution
- [x] add focused contract, renderer-boundary and CSP regression coverage
- [ ] introduce mutable skills only as separate resource-scoped contracts with rollback and audit storage

## Safe Voice Command Room — 2026-08-20

- [x] add a calm desktop HUD with explicit microphone, speaker, local voice and execution states
- [x] keep microphone permission fail-closed and classify browser Web Speech as unverified, not local STT/TTS
- [x] expose a fixed read-only skill allowlist and block shell, writes, installs, deploy and secrets
- [x] require plan -> diff -> approval -> one-shot execute -> receipt, with a session kill switch engaged by default
- [x] represent Markdown memory as preview-only until a separately reviewed local persistence contract exists

This roadmap is the working master plan for turning `Eclipse Hopson Sentinel` into a professional local operator platform under the `Eclipse Hopson` brand.

## Offline Spec Gate verifier - 2026-08-13

- [x] expose sentinel spec verify before the inherited runtime starts
- [x] require the exact approved eclipse.spec-gate.v1 shape while keeping implement blocked
- [x] reject absolute, traversal and .git paths, symlinks, workspace escape and policy escalation
- [x] hash local evidence in read-only mode without network, shell or artifact commands
- [x] cover valid input, traversal and symlink escape with regression tests
- [ ] add semantic evidence evaluators only as separately reviewed, fail-closed plugins
## Strategic priorities

1. make `Sentinel Core` trustworthy for daily coding work
2. make `Sentinel Voice` reliable enough for repeated local use
3. reduce inherited upstream risk through cleanup, testing, and clear contracts
4. create a stable product foundation before chasing advanced assistant features

## Read-only browser and ads operator boundary - 2026-08-02

- [x] add a fail-closed browser capability policy for HTTPS, public, allowlisted, read-only pages
- [x] reject private IPv4/IPv6 destinations, URL credentials, cookie import, external telemetry and all browser mutations
- [x] provide a telemetry-off loopback Camofox-compatible environment contract without installing the community wrapper
- [x] wire the policy into an env-gated `BrowserRead` tool that exposes only disposable create/snapshot/stats/close calls
- [x] add a bounded spend anomaly detector that can only return `notify_only`
- [ ] complete a dedicated container/network security review and real runtime smoke before enabling BrowserRead in production profiles
- [ ] wire notify-only ads anomalies into the production scheduler after the inherited TypeScript baseline is restored

## Secure MCP baseline - 2026-07-29

- [x] add version-pinned `context7`, `filesystem`, and `github-readonly` presets to the real Sentinel MCP CLI
- [x] require one explicit existing directory for Filesystem instead of broad implicit access
- [x] keep GitHub credentials in the process environment and enable read-only, lockdown, and limited toolsets
- [ ] add scheduled tool-description hash verification after the first approved runtime scan

## TypeScript baseline - 2026-07-31

- [x] verify the shipped Bun build and CLI smoke: `0.1.7` builds and reports its version
- [x] verify provider tests: 47 focused tests pass
- [x] measure the inherited strict TypeScript baseline without weakening `tsconfig`: 4,504
      errors across 832 files
- [x] restore schema-derived SDK core/control aliases, normalized usage/settings types,
      build macro declarations, and the ES2023 library contract; strict errors now total
      3,982 (522 fewer) and the restored surface adds no new errors
- [x] make the entire 216-test Bun suite blocking in CI instead of reducing failures to warnings
- [x] add a strict `typecheck:supported` gate for maintained, self-contained Eclipse contracts
- [x] add a reproducible debt audit that fails when the inherited full-program baseline grows
- [ ] restore a fully green `npm run typecheck` as a dedicated XL cleanup track. Start with
      lawful reconstruction of generated/internal message, transport, plugin and wizard contracts,
      then runtime symbols and implicit `any`; do not hide the baseline with broad excludes,
      generated `any` stubs or relaxed strictness

The reproducible 2026-08-13 baseline is 3,995 diagnostics on Windows and 4,291 on Linux CI.
The Windows profile includes 517 `TS2307`
diagnostics across 196 unique missing module specifiers. Build success does not make these errors
acceptable. CI now contains the debt while the strict supported-contract gate protects new Eclipse
work; the baseline must be reduced in reviewed slices and deleted once the full program is green.

## Distribution provenance gate - 2026-07-31

- [x] replace the inaccurate repository-wide MIT claim with a mixed-provenance notice
- [x] mark the npm package private and remove public publish configuration
- [x] disable automatic and manual package updates in the private build so Sentinel cannot
      silently replace itself with Gitlawb/OpenClaude or Anthropic artifacts
- [ ] identify the exact Gitlawb/openclaude commit used by the initial import
- [ ] obtain legal clearance before public redistribution, package publication, sublicensing,
      or sale of the inherited TypeScript CLI
- [ ] record the exact Rust parity import SHA and confirm its license at that revision

## Research intake - 2026-07-31

### Agent capability health

- keep **Agent Reach** as an architecture reference for capability registry, read-only `doctor`,
  visible failure reasons, and deterministic fallback order
- do not install its mutable multi-tool stack, reuse primary browser cookies, or let an agent
  self-install global packages
- any future Sentinel connector registry requires signed/pinned entries, least privilege,
  explicit egress, isolated execution, prompt-injection boundaries, and an audit log
- first design step: render synthetic connector health and a safe next action without making
  network requests

## Research intake - 2026-07-01

Source: [Eclipse Library · July 2026 project integration](https://library.eclipse-forge.ru/#guide/july-2026-project-integration).
These are references and backlog candidates, not implemented capabilities.

### Operator memory

- evaluate **OpenHuman** as a reference for long-lived local operator memory: user habits, cwd/session context, docs/logs, goals, consent scopes, audit trail, and memory deletion
- keep memory local-first by default; remote sync must be opt-in and scoped
- add a future design note for "what the operator can remember" vs "what must stay ephemeral"

### Mobile control plane

- evaluate **OpenClaw Mobile** as a UX reference for remote approval/control: agent proposes action -> user confirms from phone
- require explicit permissions for camera, geolocation, voice, screen context, and command execution
- add a mobile approval mode only after local bridge auth, token rotation, and audit logging are stable

### Model routing

- evaluate **OmniRoute** as a reference for a safe model-router: local/cloud providers, fallback order, context compression, cost/error/latency metrics
- production rule: only legal keys, owned quotas, and ToS-safe providers; no "free token bypass" dependency
- first POC should expose one OpenAI-compatible endpoint with two providers and clear failure logs

## Research intake - 2026-07-13

Source: [Eclipse Library · Applied project plan](https://library.eclipse-forge.ru/#guide/applied-project-plan-2026-07-13).
These items are product directions and safety references, not installed runtime dependencies.

### Agent safety and shell guardrails

- evaluate **Destructive Command Guard** as a pre-command safety layer for autonomous shell actions
- add a local `sentinel doctor safety` concept: risky command detection, safer alternatives, audit output
- never execute destructive command rewrites silently; user confirmation remains mandatory
- [x] pin AgentShield `1.4.0` in the local and CI agent-config security gates instead of executing an unreviewed latest package

### Workstation doctor

- use **privacy.sexy** as a reference checklist for OS/browser telemetry and privacy posture
- use **Fast File Explorer** as a reference for fast file search, preview and checksum UX
- use **NtWarden** only as lab/VM reference for Windows security diagnostics; never require kernel-driver tools for normal users
- [x] ship a standalone read-only Windows Doctor for Secure Boot, TPM, Defender, Firewall, UAC, disk encryption, SMBv1, RDP, Windows Update, restart state, telemetry policy and persistent PowerShell policy
- [x] expose stable `windows-doctor-v1` JSON without device identity, secrets or automatic remediation
- [x] add a dependency-free synthetic self-test and Windows CI gate
- [ ] add a reviewed desktop summary after the existing desktop shell has a stable security boundary; keep every remediation behind an explicit diff and user confirmation

### Voice and live operator

- evaluate **Voicetypr** for local STT and transcript cleanup
- evaluate **Sokuji** for live translation/subtitles and virtual microphone patterns
- evaluate **Fish Audio** only for consent-safe voice/TTS experiments

### Mobile control plane

- use **PCLink** and OpenClaw Mobile patterns for phone approvals: PC proposes action -> phone confirms -> bridge logs the decision
- remote control must require localhost/VPN, auth tokens, rotation, and visible audit trail
- keep **VCamdroid** as a camera-input architecture and permission-UX reference only; do not install its admin DLL/APK/ADB stack on the primary workstation. Any future proof of concept requires a disposable Windows VM, a separate Android device, pinned-source audit and an explicit camera use case.

### Token economy

- use installed Codex skills (`context-compression`, `ponytail-review`, `loopy`, `caveman-compress`) as development workflow helpers
- benchmark `sqz` separately before adopting any dedup/MCP layer
- do not use lossy image-context approaches for code, secrets, migrations or exact logs

### Local model runtime R&D

- use **Colibri** as an architecture reference for disk-streamed MoE local runtimes, not as a default dependency
- extract the `plan` / `doctor` pattern into a future `sentinel doctor model` command: RAM, disk, provider reachability, model path, expected speed and safe next action
- document the reality check clearly: a 744B model can be made runnable on consumer hardware, but cold decode is disk-bound and not a production-speed promise
- see [sentinel-local-model-runtime-rd.md](sentinel-local-model-runtime-rd.md) for the first research contract

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
- [ ] Run the network-gated direct Kimi K3 `sentinel` synthetic suite from Eclipse AI Hub twice; record safety score, latency, tokens and cost before considering a provider preset. See [sentinel-kimi-k3-benchmark.md](sentinel-kimi-k3-benchmark.md).
- [ ] Keep TokenRouter rejected until owner, Terms, DPA, routing providers, retention, subprocessors and promotion limits are verified; never use it as a shortcut to the direct benchmark.
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
- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) — Alibaba TTS with Russian support, 49 voices, 97ms latency, voice cloning (TADA alternative)
- [CosyVoice 3](https://github.com/FunAudioLLM/CosyVoice) — 0.5B mini TTS, Russian, zero-shot voice cloning in 3 sec, runs on weak hardware (best for low-resource Sentinel setups)
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
## Operational visual contract pilot - 2026-08-12

- [x] Add a typed, dependency-free `eclipse-forge.visual-system.v1` contract and local JSON snapshot.
- [x] Rebrand the startup status and move the terminal gradient from upstream orange to Eclipse gold -> signal blue.
- [x] Map suggestion, memory and rate-limit progress to the shared signal color.
- [x] Pass the focused contract test and production build. The inherited full TypeScript baseline still fails on missing upstream modules and legacy typing errors.
- [x] Remediate the inherited Bun dependency graph; the 2026-08-13 `bun audit` reports zero advisories, while lifecycle scripts remain blocked and package publishing stays disabled.

### GPT-5.6 fixed-profile rollout — 2026-08-17

- [x] Add fast, balanced, and deep aliases for Luna, Terra, and Sol through the existing Codex Responses transport.
- [x] Keep model choice and reasoning defaults explicit and covered by focused provider tests.
- [ ] Run production-like quality, latency, and usage evals before changing any default or enabling autonomous tools.

## Eclipse Ultron desktop identity — 2026-08-25

### P0 completed

- [x] Introduce Eclipse Ultron as the user-facing desktop product while preserving Sentinel runtime, storage and IPC identifiers.
- [x] Replace the static operator surface with a state-driven Ultron Core: idle, listening, approval, executing, speaking, success and blocked.
- [x] Keep the execution sequence deterministic: command -> plan/diff -> human approval -> one-shot execute -> receipt.
- [x] Add explicit STOP and Motion controls; respect OS reduced-motion and keep core animation to transform/opacity.
- [x] Add fixed local CUDA Whisper one-shot STT through trusted Electron IPC without renderer parameters, shell expansion, OAuth, background recording or transcript persistence.
- [x] Rebrand the application, first-run guide, icon and NSIS artwork to the original Eclipse crimson/graphite/silver system.
- [x] Verify a machine-wide Windows upgrade from Sentinel 1.1.1 to Ultron 1.2.0 in the approved E-drive directory.
- [x] Install the verified portable `whisper.cpp b4938` runtime and `large-v3-turbo-q5_0` model only on the approved E-drive, then pass a real Russian microphone smoke.
- [x] Install portable Ollama 0.32.15 and a Qwen3.8 27B Q4 candidate in an isolated loopback Lab profile with a separate E-drive model store and no tools.

### P1 next

- [ ] Add an in-product download/update verifier for Local AI Runtime; binaries and weights remain outside Git and installer.
- [x] Complete the 27B warm/cold latency pilot: 233.3 s cold load and about 7 tok/s warm generation confirm Lab must remain opt-in chat-only; `qwen3:8b` stays primary.
- [ ] Add an explicit cancellable voice session contract before offering longer capture windows.
- [ ] Add signed Windows releases; an unsigned installer remains local/internal only.
- [ ] Expand Ultron Core beyond read-only only through separate least-privilege capability contracts and visible approval gates.
