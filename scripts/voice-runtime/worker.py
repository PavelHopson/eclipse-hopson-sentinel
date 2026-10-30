"""Bounded requests over inherited pipes; no HTTP, cloning, mic or tools."""
from __future__ import annotations

import argparse
import base64
import contextlib
import importlib.metadata as metadata
import io
import json
import os
from pathlib import Path
import sys
import time
import wave
import warnings
from typing import BinaryIO

# -I intentionally excludes cwd; only this owned helper directory is added.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from guard import BoundaryError, MAX_REQUEST_BYTES, PROFILES, deny_network, offline_environment, parse_request, verify_model


class DiscardLog(io.TextIOBase):
    def write(self, message: str) -> int:
        return len(message)


def stage(name: str) -> None:
    print(json.dumps({"stage": name}), file=sys.stderr, flush=True)


def read_request(stream: BinaryIO, session: bool) -> dict[str, str] | None:
    if not session:
        return parse_request(stream.read(MAX_REQUEST_BYTES + 1))
    raw = stream.readline(MAX_REQUEST_BYTES + 2)
    if not raw:
        return None
    if not raw.endswith(b"\n") or len(raw) > MAX_REQUEST_BYTES + 1:
        raise BoundaryError("request-framing")
    return parse_request(raw[:-1])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", required=True)
    parser.add_argument("--model-lock", required=True)
    parser.add_argument("--session", action="store_true")
    args = parser.parse_args()
    try:
        request = read_request(sys.stdin.buffer, args.session)
        if request is None:
            return 0
        lock_file = Path(args.model_lock)
        if not lock_file.is_file() or lock_file.stat().st_size > 32768:
            raise BoundaryError("invalid-lock")
        verify_model(Path(args.model_root), json.loads(lock_file.read_text(encoding="utf-8")))
        if metadata.version("transformers") != "5.16.1":
            raise BoundaryError("unapproved-transformers")
        env = offline_environment()
        os.environ.clear()
        os.environ.update(env)
        sys.addaudithook(deny_network)
        stage("loading-offline-cpu")
        started = time.monotonic()
        # Third-party progress/warnings never become response payloads or logs.
        with contextlib.redirect_stdout(DiscardLog()), contextlib.redirect_stderr(DiscardLog()), warnings.catch_warnings():
            warnings.simplefilter("ignore")
            import numpy as np
            import torch
            from qwen_tts import Qwen3TTSModel
            torch.set_num_threads(4)
            torch.set_num_interop_threads(1)
            torch.manual_seed(28)
            model = Qwen3TTSModel.from_pretrained(
                args.model_root, device_map="cpu", dtype=torch.float32,
                attn_implementation="sdpa", local_files_only=True,
                trust_remote_code=False, use_safetensors=True,
            )
        load_seconds = time.monotonic() - started
        # Restore post-load RNG for independent utterances, never a previous
        # phrase's sampling state. Only model weights and RNG stay resident.
        rng = torch.get_rng_state()
        for sequence in range(8 if args.session else 1):
            if sequence:
                request = read_request(sys.stdin.buffer, True)
                if request is None:
                    break
            torch.set_rng_state(rng)
            stage("synthesizing")
            started = time.monotonic()
            with contextlib.redirect_stdout(DiscardLog()), contextlib.redirect_stderr(DiscardLog()), torch.inference_mode():
                waves, sample_rate = model.generate_custom_voice(
                    text=request["text"], language="Russian", speaker=PROFILES[request["profile"]],
                    do_sample=False, subtalker_dosample=True, max_new_tokens=300,
                )
            synthesis_seconds = time.monotonic() - started
            audio = np.asarray(waves[0])
            if audio.size >= 299 * 1920:
                raise BoundaryError("generation-limit")
            if (sample_rate != 24000 or audio.ndim != 1 or not np.isfinite(audio).all()
                    or not 0.1 <= len(audio) / sample_rate <= 26):
                raise BoundaryError("invalid-audio")
            output = io.BytesIO()
            with wave.open(output, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sample_rate)
                wav.writeframes((np.clip(audio, -0.98, 0.98) * 32767).astype("<i2").tobytes())
            result = {
                "ok": True, "profile": request["profile"], "audio": base64.b64encode(output.getvalue()).decode("ascii"),
                "loadSeconds": round(load_seconds if sequence == 0 else 0, 3),
                "synthesisSeconds": round(synthesis_seconds, 3), "durationSeconds": round(len(audio) / sample_rate, 3),
            }
            if args.session:
                result["sequence"] = sequence
            print(json.dumps(result), flush=True)
            del request, result, audio, waves, output
        return 0
    except BoundaryError as error:
        print(json.dumps({"ok": False, "error": str(error)}), flush=True)
    except Exception:
        print(json.dumps({"ok": False, "error": "runtime-failed"}), flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
