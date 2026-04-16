"""
MOSS-TTS-Nano HTTP server for Eclipse Hopson Sentinel.

Exposes a minimal REST API that wraps MOSS-TTS-Nano for high-quality
neural text-to-speech.  The TypeScript adapter (src/services/tts/
mossTTSAdapter.ts) calls this server over HTTP.

Install:
    pip install moss-tts-nano flask

Run:
    python scripts/moss-tts-server.py

Environment variables:
    MOSS_TTS_PORT  — listen port (default: 8765)
"""

from flask import Flask, request, jsonify, send_file
import io
import os
import sys

app = Flask(__name__)
tts_model = None


def get_model():
    """Lazy-load the MOSS-TTS-Nano model on first request."""
    global tts_model
    if tts_model is None:
        try:
            from mosstts import MossTTSNano
            tts_model = MossTTSNano()
            print("[moss-tts] Model loaded successfully", file=sys.stderr)
        except ImportError:
            print(
                "[moss-tts] ERROR: mosstts package not installed. "
                "Run: pip install moss-tts-nano",
                file=sys.stderr,
            )
    return tts_model


@app.route("/health", methods=["GET"])
def health():
    """Health check — returns status 'ok' when the model is loaded."""
    model = get_model()
    status = "ok" if model else "no_model"
    return jsonify({"status": status, "engine": "moss-tts-nano"})


@app.route("/synthesize", methods=["POST"])
def synthesize():
    """Synthesize speech from text.

    Request JSON:
        text     (str)  — text to speak (required)
        language (str)  — language code, default 'ru'
        speed    (float) — playback speed multiplier, default 1.0

    Response: audio/wav on success, JSON error on failure.
    """
    data = request.json or {}
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400

    language = data.get("language", "ru")
    speed = float(data.get("speed", 1.0))

    model = get_model()
    if not model:
        return jsonify({"error": "MOSS-TTS-Nano not installed"}), 503

    try:
        audio = model.synthesize(text, lang=language, speed=speed)
    except Exception as exc:
        return jsonify({"error": f"Synthesis failed: {exc}"}), 500

    buffer = io.BytesIO(audio)
    buffer.seek(0)
    return send_file(buffer, mimetype="audio/wav")


if __name__ == "__main__":
    port = int(os.environ.get("MOSS_TTS_PORT", 8765))
    print(f"MOSS-TTS-Nano server starting on port {port}")
    app.run(host="0.0.0.0", port=port)
