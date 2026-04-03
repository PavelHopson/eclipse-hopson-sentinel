# Sentinel Voice MVP

`Sentinel Voice MVP` is the first external client for `Eclipse Hopson Sentinel`.

This version is intentionally simple:

- text input instead of microphone capture
- localhost bridge transport
- Node-based shell for fast local testing

## Goal

Validate the product loop before adding STT, TTS, and wake word:

1. send a request to `Sentinel Core`
2. get a usable answer back
3. keep the client layer separate from the core

## Start Sentinel Bridge

In the main Sentinel CLI:

```text
/sentinel-bridge --host 127.0.0.1 --port 8765 --token mytoken
```

## Run Voice MVP

From another terminal:

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\bin\sentinel-voice --url http://127.0.0.1:8765 --token mytoken --cwd E:\PR-BOT\openclaude-pavel
```

You can also use environment variables:

```powershell
$env:SENTINEL_BRIDGE_URL="http://127.0.0.1:8765"
$env:SENTINEL_BRIDGE_TOKEN="mytoken"
node .\bin\sentinel-voice
```

## Current scope

- manual text requests
- bridge-based local communication
- workspace-aware requests through `cwd`
- uses the stable bridge `response.reply` contract for rendering answers

## Not implemented yet

- speech-to-text
- text-to-speech
- wake word
- background listening
- desktop UI
- session memory tailored for voice

## Why this stage matters

This client lets us harden the contract between `Sentinel Core` and future voice surfaces before we invest in audio and desktop integration.
