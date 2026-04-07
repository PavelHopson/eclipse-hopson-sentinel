#!/usr/bin/env bash
# Cross-platform TTS for Sentinel (macOS + Linux)
# Usage: sentinel-tts.sh "text to speak" [--voice NAME] [--rate N]

set -euo pipefail

TEXT=""
VOICE=""
RATE=""

# ─── Argument parsing ────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --voice)
      VOICE="$2"
      shift 2
      ;;
    --rate)
      RATE="$2"
      shift 2
      ;;
    -*)
      echo '{"ok":false,"engine":"none","error":"Unknown option: '"$1"'"}' >&2
      exit 1
      ;;
    *)
      TEXT="$1"
      shift
      ;;
  esac
done

if [[ -z "$TEXT" ]]; then
  echo '{"ok":false,"engine":"none","error":"No text provided"}'
  exit 1
fi

# ─── Platform detection ──────────────────────────────────────────────

OS="$(uname -s)"

# ─── macOS: use built-in `say` ───────────────────────────────────────

if [[ "$OS" == "Darwin" ]]; then
  ARGS=()
  if [[ -n "$VOICE" ]]; then
    ARGS+=(-v "$VOICE")
  fi
  if [[ -n "$RATE" ]]; then
    ARGS+=(-r "$RATE")
  fi

  if say "${ARGS[@]}" "$TEXT" 2>/dev/null; then
    echo '{"ok":true,"engine":"say"}'
  else
    echo '{"ok":false,"engine":"say","error":"say command failed"}'
    exit 1
  fi
  exit 0
fi

# ─── Linux: try espeak-ng → espeak → spd-say ────────────────────────

if [[ "$OS" == "Linux" ]]; then

  # Try espeak-ng first (modern replacement for espeak)
  if command -v espeak-ng &>/dev/null; then
    ARGS=()
    if [[ -n "$VOICE" ]]; then
      ARGS+=(-v "$VOICE")
    fi
    if [[ -n "$RATE" ]]; then
      ARGS+=(-s "$RATE")
    fi

    if espeak-ng "${ARGS[@]}" "$TEXT" 2>/dev/null; then
      echo '{"ok":true,"engine":"espeak-ng"}'
    else
      echo '{"ok":false,"engine":"espeak-ng","error":"espeak-ng failed"}'
      exit 1
    fi
    exit 0
  fi

  # Try classic espeak
  if command -v espeak &>/dev/null; then
    ARGS=()
    if [[ -n "$VOICE" ]]; then
      ARGS+=(-v "$VOICE")
    fi
    if [[ -n "$RATE" ]]; then
      ARGS+=(-s "$RATE")
    fi

    if espeak "${ARGS[@]}" "$TEXT" 2>/dev/null; then
      echo '{"ok":true,"engine":"espeak"}'
    else
      echo '{"ok":false,"engine":"espeak","error":"espeak failed"}'
      exit 1
    fi
    exit 0
  fi

  # Fallback: spd-say (speech-dispatcher)
  if command -v spd-say &>/dev/null; then
    ARGS=()
    if [[ -n "$RATE" ]]; then
      ARGS+=(-r "$RATE")
    fi
    # spd-say does not support --voice by name in the same way; ignore it
    ARGS+=(-w) # wait for speech to finish

    if spd-say "${ARGS[@]}" "$TEXT" 2>/dev/null; then
      echo '{"ok":true,"engine":"spd-say"}'
    else
      echo '{"ok":false,"engine":"spd-say","error":"spd-say failed"}'
      exit 1
    fi
    exit 0
  fi

  echo '{"ok":false,"engine":"none","error":"No TTS engine found. Install espeak-ng, espeak, or speech-dispatcher."}'
  exit 1
fi

# ─── Unsupported platform ───────────────────────────────────────────

echo '{"ok":false,"engine":"none","error":"Unsupported platform: '"$OS"'"}'
exit 1
