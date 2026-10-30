# Sentinel release manifest — 2026-10-30

## В основной release-кандидат

- root: `AGENTS.md`, `README.md`, `package.json`, `.github/workflows/ci.yml`, `.gitignore`;
- `dashboard/`: Electron runtime, React UI, voice lifecycle, local-model diagnostics, task ledger, mascot assets and installer helpers;
- `office/`: Windows credential-boundary module;
- `scripts/`: voice runtime, dashboard regression tests, STT/TTS wrappers and fixed-path security helpers;
- `docs/`: `PROJECT-CONTEXT.md`, `repository-guide.md`, voice security/evaluation notes and this manifest.

## Оставить вне основного release-кандидата

- `experiments/codex-gateway/`;
- `experiments/footprint-pilot/`;
- `experiments/pilots/`;
- исторические incident/evidence файлы, которые не нужны для сборки и runtime;
- локальные build outputs, `node_modules`, отчёты с приватными путями и временные smoke-артефакты.

## Проверки

- dashboard `npm run lint` — PASS;
- dashboard `npm run build` — PASS;
- dashboard runtime audit — 0 high/critical;
- Sentinel `npm run test:voice` — 166/166 PASS;
- перемещение экспериментов в `experiments/` — PASS;
- media-provenance и REA после переноса — 31/31 PASS.

## Ограничение

Manifest описывает отбор, но не является разрешением на commit/push. Перед публикацией нужно staged-проверкой подтвердить точный список путей и пройти rebase от свежего `origin/main`.
