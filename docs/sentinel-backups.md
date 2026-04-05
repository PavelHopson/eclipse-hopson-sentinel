# Sentinel Backups

`Sentinel Backups` is the first local backup discipline layer for `Eclipse Hopson Sentinel`.

It is inspired by the strongest operational safety ideas in `ai-setup`, but implemented as a simple local snapshot system for Sentinel-owned surfaces.

## Goal

Create quick, deterministic local snapshots before larger config or voice-system changes.

## Run

Create a backup:

```powershell
cd E:\PR-BOT\openclaude-pavel
node .\scripts\sentinel-backup.mjs create
```

Or:

```powershell
npm run backup:create
```

## What gets backed up

- `README.md`
- `SECURITY.md`
- `package.json`
- `docs/`
- `bin/sentinel`
- `bin/sentinel-voice`
- voice scripts
- config health script
- `.sentinel/bridge` state when present

## Storage location

Backups are written under:

```text
.sentinel/backups/
```

Each backup gets its own timestamped snapshot directory with a `manifest.json`.

## Why this matters

This gives Sentinel the beginning of a professional safety discipline:

- snapshot before risky changes
- local-only storage
- transparent files
- easy manual inspection

## Planned upgrades

- add backup index and listing metadata
- add restore command
- add pre-change backup flow for high-impact config updates
- add score regression checks before accepting generated changes
