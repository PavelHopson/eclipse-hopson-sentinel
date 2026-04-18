# ADR 0001 — Hybrid TypeScript / Rust / Python architecture

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** Project lead

## Context

Eclipse Hopson Sentinel is a **local-first AI operator**: a terminal /
voice-driven agent that can read and write files, run shell commands,
orchestrate multiple LLM providers (OpenAI, Anthropic, Gemini, Ollama,
Codex, a local atomic-chat provider), and — in the voice layer — listen
for a wake word, transcribe speech, and synthesize replies back out
loud.

The system spans three very different problem domains:

1. **Agent orchestration & DX.** Command parsing, task planning, tool
   invocation, MCP integration, TUI rendering (ink / React for the
   terminal), LSP, file edits, conversation history. This is "messy
   business logic" — it moves fast, is heavily UI-shaped, and benefits
   from a fast iteration loop.
2. **Performance-critical runtime.** Process spawning, low-latency
   inter-process bridges (daemon, voice server, wake-word watcher),
   file watching, sandboxed tool execution, IO primitives. Here
   latency, memory safety, and zero GC pauses matter.
3. **AI / audio ecosystem.** Voice stack (wake word, STT, TTS), model
   adapters that frequently ship first in Python (Whisper, Silero,
   MOSS-TTS-Nano, Piper, etc.), and model-tuning scripts. The research
   ecosystem lives in Python and will keep living there.

No single language is a good fit for all three. TypeScript is great for
(1) and terrible for the hot path in (2). Rust is great for (2) and
miserable for (1) when we are prototyping a TUI feature per day. Python
is the only serious option for (3) but is a bad fit for a user-facing
CLI.

The repo reflects this reality already (see `package.json` and the
top-level directory listing):

- **TypeScript / Bun:** the main runtime — `src/` is the CLI, command
  surface, agent loop, tools, MCP clients, TUI, LSP, and provider
  integrations. `bin/sentinel`, `bin/sentinel-voice`, `bin/pavelcode`
  are the user-facing entry points. The TS codebase is ~207K LOC (the
  overwhelming majority of the project).
- **Rust:** `rust/Cargo.toml` is a workspace of 7 crates covering the
  next-generation performance-critical engine, sandboxed execution,
  and mock-parity harness (see `rust/MOCK_PARITY_HARNESS.md`,
  `rust/PARITY.md`, `rust/TUI-ENHANCEMENT-PLAN.md`). Build/test scripts
  are exposed via `npm run rust:build`, `rust:test`, `rust:check` in
  `package.json`.
- **Python:** `atomic_chat_provider.py`, `ollama_provider.py`,
  `smart_router.py` and their tests (`test_atomic_chat_provider.py`,
  `test_ollama_provider.py`, `test_smart_router.py`) handle
  provider-adapter flows — 44 Python tests total across the provider
  suite. Voice / TTS bridges (e.g. `scripts/moss-tts-server.py`) also
  live on the Python side.

## Decision

We intentionally run **a hybrid TypeScript + Rust + Python codebase**,
with the following responsibility split:

- **TypeScript / Bun (primary runtime)** — agent loop, CLI, TUI,
  commands, tools, MCP, LSP, telemetry, provider dispatch, UX. This is
  where almost all day-to-day work happens. Built via `bun run build`
  → `dist/cli.mjs`, published to npm as `@eclipse-hopson/sentinel`.
- **Rust (performance / future engine)** — workspace under `rust/` for
  hot-path code: process spawning, the next-gen agent engine, parity
  harness that validates Rust behavior against the TypeScript reference
  implementation. Treated as the **future primary engine** while still
  stabilizing — see `docs/hybrid-architecture.md`.
- **Python (AI / voice adapters)** — provider adapters where upstream
  ships a Python SDK first (Ollama, atomic chat), voice-stack servers
  (MOSS-TTS-Nano via `scripts/moss-tts-server.py`), any future
  Whisper / Silero bridges. Python code runs as subprocesses or as
  small HTTP servers called from TS.

Inter-language communication:

- **TS → Rust:** currently via process spawn (the TS layer calls Rust
  binaries built by `cargo build --release`). Parity is validated
  continuously by the mock-parity harness.
- **TS → Python:** via subprocess for one-shot tools, or via small
  HTTP servers on `localhost` for stateful services (e.g. the
  MOSS-TTS HTTP bridge on port 8765). This pattern is described in
  `docs/moss-tts.md` and ADR 0002.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Pure TypeScript (Node.js / Bun only)** | One language, one toolchain, one build, no FFI pain, fastest onboarding | Can't match native perf for process orchestration / audio-pipeline hot paths, has to re-implement what Python ML libraries already do, GC pauses visible in real-time scenarios | Viable today, insufficient tomorrow. Voice + sandboxed execution + the Rust mock-parity ambition all require native-speed code eventually. |
| **Pure Rust** | Best perf, memory safety, single binary distribution, no runtime | Brutal iteration speed for TUI / CLI features that change daily, smaller ecosystem for LLM client SDKs, every provider adapter would need to be hand-rolled, ink-style React-in-terminal experience has no equal in Rust | Kills velocity. A single-developer project cannot afford a 10× slowdown on UX iteration. The TUI code alone would take months to rebuild. |
| **Pure Python** | Best ML ecosystem, fastest prototype for AI code, ubiquitous in voice/LLM research | Slow for CLI startup, poor terminal UX toolkit compared to ink, distribution is painful (pip + venv + system deps), no good story for latency-sensitive code | We would ship a slower, clunkier CLI to get AI ecosystem access we can have anyway via subprocess/HTTP. |
| **Go** | Single binary, fast, good concurrency primitives | No ML ecosystem, requires rewriting every LLM adapter, terminal UI libraries are serviceable but not ink-level, would throw away the TS codebase | Switching cost is enormous, gain is marginal vs Rust for perf and vs TS for UX. |
| **Node + native addons (N-API / Neon)** | Stays on Node, gets native speed where needed | N-API build story is painful across platforms, Windows native builds are a recurring support burden, binds us to Node instead of Bun | Rust-via-subprocess gives us the same perf benefit with a cleaner boundary and no native-build-on-install headache. |
| **One language + WASM for hot paths** | Theoretically "one language fits all" | WASM ecosystem is still maturing for system tasks, sandboxing and filesystem primitives are awkward, performance is close to native but not equal | Worth re-evaluating in 2 years. Not ready for what we need today. |

## Consequences

### Positive

- **Right tool for each layer.** TS handles what TS is best at (rapid
  UX iteration, React-shaped TUI, massive npm ecosystem for LLM SDKs).
  Rust handles what Rust is best at (latency, sandboxing, future
  engine). Python handles what only Python can (direct access to the
  ML / voice research ecosystem).
- **Gradual migration path.** The Rust runtime matures **in parallel**
  with the TypeScript one, validated by the mock-parity harness. We
  never ship a breaking Rust rewrite — the TS agent keeps working
  while Rust catches up feature by feature.
- **Python is contained.** Python code never runs in-process with TS.
  It is always a subprocess or an HTTP bridge. This means Python
  version conflicts, venv problems, and pip issues are isolated from
  the core runtime.
- **Distribution is clean.** The npm package ships `dist/cli.mjs` and
  a thin `bin/` wrapper. Rust binaries are built per-platform and
  loaded as needed. Python components are optional: if absent, the
  TTSRouter falls back to system TTS (see ADR 0002).
- **Tests match each layer's culture.** `bun test` for TS (fast),
  `cargo test` for Rust (deep), `pytest` for Python (44 tests covering
  provider adapters). Each layer is tested idiomatically.

### Negative

- **Three toolchains to install.** A contributor who wants to touch
  every layer needs Bun + Rust (rustup) + Python (with a venv). The
  `doctor:runtime` script (`scripts/system-check.ts`) exists to tell
  you what is missing, but it is still a real onboarding tax.
- **Three mental models.** Error handling in TS (`try/catch`, `Result`
  via zod) is nothing like Rust's `Result<T, E>`, which is nothing
  like Python's exceptions. Switching layers is context-shift-heavy.
- **Cross-language contracts are weaker than in-process.** Subprocess
  boundaries mean we serialize arguments and parse output. Typos and
  schema drift between the TS caller and the Python/Rust callee are
  real risks. We mitigate with zod schemas on the TS side and explicit
  JSON contracts on the wire.
- **Release engineering is 3× the work.** We need to publish the npm
  package, build per-platform Rust binaries, and document Python
  optional deps. Version skew between layers is possible.
- **Debugging cross-boundary issues is harder.** A voice request that
  goes TS → Python HTTP → MOSS-TTS → audio out has four places to
  break. Tracing requires log correlation (OpenTelemetry is wired in —
  see the `@opentelemetry/*` deps in `package.json` — but it is not a
  cure-all).
- **Parity harness is mandatory, not optional.** The Rust engine
  cannot be a "maybe someday" thing. Because TS is still the
  reference, any Rust behavior that diverges is a bug. Keeping the
  mock-parity harness green is ongoing work.

### Neutral

- **The project fits a particular kind of contributor.** Someone
  comfortable at the boundary between systems programming, scripting,
  and UI engineering. A pure frontend dev or a pure ML researcher
  would find it awkward. That is acceptable given the product's
  nature.
- **Per-language LOC distribution is skewed.** TypeScript dominates
  (~207K LOC), Rust is meaningful but smaller (7 crates), Python is
  small and bounded (a handful of files + their tests). This reflects
  usage and is the expected shape.
- **`package.json` is the source of truth for orchestration.** Bun /
  npm scripts drive Rust (`rust:build`, `rust:test`, `rust:check`)
  and any Python flows. One command entry point keeps the hybrid
  tolerable.

## Guardrails

To prevent the hybrid from degrading into chaos:

1. **New features start in TypeScript.** Rust rewrites happen only
   after a feature has stabilized in TS and the mock-parity harness
   has a scenario for it.
2. **No in-process FFI.** All cross-language calls are subprocess or
   localhost HTTP. This enforces a clean boundary and isolates
   crashes.
3. **Python is optional at runtime.** If a Python component is not
   installed, Sentinel degrades gracefully (e.g. TTS falls back to
   system voice). No Python = system still usable.
4. **Rust crates live in `rust/`, not scattered.** The workspace
   keeps them together and makes `cargo` ergonomic.
5. **Type boundaries are documented.** The zod schemas in
   `src/schemas/` and the parity-harness JSON in
   `rust/mock_parity_scenarios.json` are the contract.

## References

- Architecture overview: `docs/hybrid-architecture.md`
- Rust workspace: `rust/Cargo.toml`, `rust/PARITY.md`,
  `rust/MOCK_PARITY_HARNESS.md`
- Python provider adapters: `atomic_chat_provider.py`,
  `ollama_provider.py`, `smart_router.py`
- Build / test entry points: `package.json` scripts (`build`,
  `rust:*`, `test:provider`, `smoke`, `doctor:*`)
- Health diagnostics: `scripts/system-check.ts`
- Related: ADR 0002 (MOSS-TTS-Nano adapter)
