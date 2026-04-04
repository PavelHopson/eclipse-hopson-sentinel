# Sentinel Voice MVP

`Sentinel Voice MVP` is the first external client for `Eclipse Hopson Sentinel`.

This version is intentionally simple:

- terminal-first client with optional local speech input and output
- localhost bridge transport
- Node-based shell for fast local testing

## Goal

Validate the product loop before adding STT, TTS, and wake word:

1. send a request to `Sentinel Core`
2. get a usable answer back
3. keep the client layer separate from the core
4. maintain a reusable dialogue session through the bridge

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

With speech output on Windows:

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\bin\sentinel-voice --speak --voice Russian --rate 1
```

With one-shot speech input enabled:

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\bin\sentinel-voice --stt --stt-timeout 8 --speak --voice Russian
```

Inside the client, type:

```text
/listen
```

Then the client will listen once, convert speech to text, and send the recognized prompt to `Sentinel Core`.

With push-to-talk mode enabled:

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\bin\sentinel-voice --stt --ptt --speak --voice Russian
```

In push-to-talk mode:

- press `Enter` on an empty prompt to trigger one listening cycle
- type `/ptt` to toggle push-to-talk on or off
- type `/listen` if you want to trigger a one-shot capture manually

List available system voices:

```powershell
node .\bin\sentinel-voice --list-voices
```

Run voice diagnostics:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sentinel-voice-doctor.ps1
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
- creates a bridge session and reuses the underlying Sentinel session between turns
- can optionally speak answers on Windows through local system TTS
- can optionally capture one speech phrase on Windows through local system STT
- has a safe terminal push-to-talk mode built on top of one-shot STT
- includes a standalone voice doctor script for local environment diagnostics

## Not implemented yet

- wake word
- background listening
- desktop UI
- session memory tailored for voice

## Current TTS implementation

- Windows-only local speech output through `SAPI.SpVoice`
- no external cloud dependency for speech
- voice selection is substring-based, for example `Russian` or `Zira`

## Current STT implementation

- Windows-only one-shot speech capture through `System.Speech.Recognition`
- activated manually with `/listen`
- can be used through a safe push-to-talk terminal loop
- currently optimized for safe MVP validation, not continuous background listening

## Why this stage matters

This client lets us harden the contract between `Sentinel Core` and future voice surfaces before we invest in audio and desktop integration.
