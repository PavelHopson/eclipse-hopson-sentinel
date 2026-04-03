# Eclipse Hopson Sentinel Hybrid Architecture

`Eclipse Hopson Sentinel` is being developed as a multi-layer local AI system.

## Sentinel Core

The current primary engine:

- TypeScript/Bun runtime
- coding-agent workflow
- file, shell, tool, task, and MCP orchestration
- model-provider integration

This is the most practical day-to-day layer right now.

## Sentinel Rust Runtime

The parallel engine in `rust/`:

- designed for higher performance and stronger runtime discipline
- currently treated as the next-generation engine
- evolves in parallel with the TypeScript runtime

## Sentinel Voice

Planned outer layer:

- wake word
- speech-to-text
- speech synthesis
- desktop shell / operator UI
- bridge to Sentinel Core

## Recommended product shape

- `Sentinel Core` stays the operational brain
- `Sentinel Voice` becomes the interaction shell
- the Rust runtime matures underneath as the future engine

## Why this split matters

- we keep a usable coding core today
- we avoid coupling voice experiments to the main agent runtime
- we can evolve voice, UI, and runtime independently
