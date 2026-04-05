# Sentinel Bridge API

`Sentinel Bridge` is the first localhost transport layer for future `Sentinel Voice` and desktop clients.

## Goal

Expose a small local JSON API so external clients can talk to `Sentinel Core` without embedding the full runtime.

## Start the bridge

From the interactive CLI:

```text
/sentinel-bridge
```

Optional arguments:

```text
/sentinel-bridge --host 127.0.0.1 --port 8765 --token mytoken
```

## Endpoints

### Health

```http
GET /health
```

Response:

```json
{
  "ok": true,
  "service": "sentinel-bridge",
  "status": "healthy",
  "responseFormat": "voice-v1",
  "persistedSessions": 2
}
```

### Ask

```http
POST /v1/ask
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "prompt": "Explain this repository",
  "cwd": "E:\\PR-BOT\\openclaude-pavel"
}
```

Response shape:

```json
{
  "ok": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": "",
  "parsed": {},
  "response": {
    "format": "voice-v1",
    "reply": "Repository summary...",
    "summary": "Repository summary...",
    "errors": [],
    "session": {
      "id": "session-id",
      "turns": 3
    },
    "metrics": {
      "durationMs": 1200,
      "apiDurationMs": 950,
      "totalCostUsd": 0.01
    },
    "rawResultType": "result",
    "rawResultSubtype": "success"
  }
}
```

## Voice-friendly contract

The `response` object is the stable contract for external clients.

- `reply` is the main text to speak or render
- `summary` is a short preview for compact UI surfaces
- `errors` contains structured error text when available
- `session` exposes minimal conversation metadata
- `metrics` gives latency and cost signals for future dashboards
- `parsed` remains available as the raw CLI result envelope

### Create session

```http
POST /v1/sessions
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "cwd": "E:\\PR-BOT\\openclaude-pavel"
}
```

Response:

```json
{
  "ok": true,
  "session": {
    "id": "bridge-session-id",
    "cwd": "E:\\PR-BOT\\openclaude-pavel",
    "sentinelSessionId": null,
    "createdAt": "2026-04-03T12:00:00.000Z",
    "updatedAt": "2026-04-03T12:00:00.000Z"
  }
}
```

### Ask within session

```http
POST /v1/sessions/<bridge-session-id>/ask
Authorization: Bearer <token>
Content-Type: application/json
```

This endpoint reuses the underlying Sentinel session via `--resume` once the first turn returns a real `session_id`.

### Get session

```http
GET /v1/sessions/<bridge-session-id>
Authorization: Bearer <token>
```

### Delete session

```http
DELETE /v1/sessions/<bridge-session-id>
Authorization: Bearer <token>
```

## Session persistence

Bridge sessions are now persisted locally on disk and restored when the bridge starts again.

Default state file:

```text
.sentinel/bridge/sessions.json
```

This keeps the mapping between:

- bridge session id
- working directory
- underlying Sentinel session id

## Current behavior

The bridge currently proxies prompts into the non-interactive Sentinel CLI.

This is the Phase 3 foundation, not the final voice runtime API.

## Next steps

- add richer structured responses
- add richer session metadata
- add voice-shell friendly response fields
- support desktop and wake-word clients
