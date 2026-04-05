# Sentinel Config Health

`Sentinel Config Health` is a deterministic local audit inspired by the strongest ideas from repositories like `caliber-ai-org/ai-setup`, but tailored for `Eclipse Hopson Sentinel`.

## Goal

Quickly answer:

- is the Sentinel project surface complete enough for daily use
- do the expected AI/operator config files exist
- do voice-related setup files exist
- is the repository moving toward a professional operator baseline

## Run

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\scripts\sentinel-config-health.mjs
```

## What it checks right now

- core files like `README.md`, `LICENSE`, `SECURITY.md`
- bridge and voice documentation
- voice helper scripts
- launcher presence
- roadmap and engineering log presence
- launcher exposure in `package.json`

## Why this matters

This gives `Sentinel` its own deterministic health audit instead of relying only on manual inspection.

It is the first practical capability borrowed from the best ideas in `ai-setup`:

- deterministic scoring
- config completeness checks
- no LLM required
- local-only evaluation

## Planned upgrades

- add freshness checks against git history
- add path grounding checks
- add bridge/voice/session persistence checks
- add runtime health checks
- add score comparison between branches
