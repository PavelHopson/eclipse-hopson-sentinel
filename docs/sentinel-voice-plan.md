# Eclipse Hopson Sentinel Voice Plan

## Product Goal

Build a local voice shell around `Sentinel Core` so the system can behave like a personal operator:

- hear commands
- route them into the coding core
- return text and speech
- later control desktop workflows

## Recommended architecture

### Core

- keep coding-agent logic in the main Sentinel repository
- expose a local bridge/API

### Voice shell

- separate module or repository
- handles microphone, STT, TTS, wake word, and desktop UI

## What we can borrow conceptually from Jarvis

- offline-first voice pipeline
- Rust desktop shell direction
- wake word + STT + TTS structure
- privacy-first positioning

## What we should not merge directly

- license-sensitive code surfaces
- unrelated assistant-specific internals
- branding and code that would contaminate Sentinel Core

## MVP sequence

1. Local bridge from voice shell to core
2. Text-only desktop shell
3. TTS responses
4. STT input
5. Wake word and background listening

## Model strategy

- default coding backend: OpenRouter OpenAI-compatible model profile
- local offline fallback: Ollama profile
- voice shell should be model-agnostic and talk only to Sentinel Core
