# Eclipse Hopson Sentinel

`Eclipse Hopson Sentinel` is a hybrid local AI system for development and personal automation.

The project is being shaped as a two-layer platform:

- `Sentinel Core` — the coding-agent runtime for code, files, shell, tools, agents, and MCP
- `Sentinel Voice` — the future local voice shell inspired by Jarvis-style interaction

Right now this repository contains the early foundation of `Sentinel Core` with:

- a working TypeScript/Bun runtime
- an imported Rust runtime workspace for the next-generation engine
- a unified launcher

## Vision

The goal is not just another CLI.

The goal is to build a local operator system under the `Eclipse Hopson` brand:

- understands code
- works through terminal tools
- can be connected to cloud or local models
- later gains voice, wake word, TTS, and desktop interaction

## Current Runtime Layers

### 1. Sentinel Core (TypeScript runtime)

The current working implementation lives in:

- `src/`
- `scripts/`
- `bin/`
- `package.json`

This is the active runtime that should be treated as the primary day-to-day engine for now.

### 2. Sentinel Rust Runtime

The `rust/` directory contains the imported Rust workspace that will evolve into the next-generation runtime.

It currently serves as a parallel engine under development.

## Quick Start

### Install dependencies

```bash
bun install
```

### Build

```bash
bun run build
```

### Run Sentinel Core

```bash
node dist/cli.mjs
```

or through the unified launcher:

```bash
node .\bin\sentinel
```

## Unified Launcher

The launcher supports both engines.

Default TypeScript runtime:

```bash
sentinel
```

Rust runtime:

```bash
sentinel --engine rust
```

or:

```bash
sentinel rust
```

Legacy compatibility:

- `pavelcode` is still kept as a compatibility entrypoint
- `bin/pavelcode` remains available as a shim during the rebrand transition

## OpenAI-Compatible Setup

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"
node .\bin\sentinel
```

## Ollama Setup

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"
node .\bin\sentinel
```

## Rust Build

```bash
cd rust
cargo build --release
```

Expected Rust binary after build:

```text
rust/target/release/sentinel-rust
```

On Windows:

```text
rust/target/release/sentinel-rust.exe
```

## Repository Structure

```text
.
├── bin/                     # launchers and compatibility shims
├── docs/                    # docs and architecture notes
├── rust/                    # next-generation Rust runtime
├── scripts/                 # build and support scripts
├── src/                     # active TypeScript runtime
├── vscode-extension/        # VS Code integration
├── package.json
└── README.md
```

## Documentation

- [Advanced Setup](docs/advanced-setup.md)
- [Windows Quick Start](docs/quick-start-windows.md)
- [macOS / Linux Quick Start](docs/quick-start-mac-linux.md)
- [Hybrid Architecture](docs/hybrid-architecture.md)
- [Sentinel Backups](docs/sentinel-backups.md)
- [Sentinel Bridge API](docs/sentinel-bridge.md)
- [Sentinel Config Health](docs/sentinel-config-health.md)
- [Sentinel Voice MVP](docs/sentinel-voice-mvp.md)
- [Engineering Log](docs/sentinel-engineering-log.md)
- [Sentinel Roadmap](docs/sentinel-roadmap.md)
- [Voice Architecture Plan](docs/sentinel-voice-plan.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)
- [Security](SECURITY.md)

## Strategic Direction

- stabilize `Sentinel Core`
- add a local bridge/API for external voice and desktop clients
- develop `Sentinel Voice` as a separate shell around the core
- continue Rust runtime maturation in parallel
- unify brand, launchers, docs, and operator workflow under `Eclipse Hopson`

## Important

- `CLAUDE_CODE_*` variables are still preserved for compatibility with the inherited runtime
- some internal names from earlier upstream layers still exist and will be cleaned up incrementally
- this repository is the main base for the `Eclipse Hopson Sentinel` system

## License

MIT
