# Sentinel Windows Installer

`Eclipse Hopson Sentinel` now includes a first Windows installer flow for local setup.

## Goal

Give users a repeatable install path with minimal manual steps.

## What the installer does

- verifies `node` exists
- verifies `bun` exists
- runs `bun install`
- runs `bun run build`
- creates `sentinel.cmd`
- creates `sentinel-voice.cmd`
- adds the installer bin directory to the user `PATH`

## Run

Preview only:

```powershell
cd E:\PR-BOT\openclaude-pavel
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
```

Real install:

```powershell
cd E:\PR-BOT\openclaude-pavel
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

## Installed location

The launcher shims are written to:

```text
%LOCALAPPDATA%\EclipseHopsonSentinel\bin
```

## Notes

- open a new terminal after install so the updated `PATH` is available
- this installer currently expects a local repository checkout
- in future versions this flow can evolve into a packaged installer
