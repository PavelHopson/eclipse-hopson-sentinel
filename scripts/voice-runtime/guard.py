"""Local TTS boundary. This is defense in depth, NOT an OS sandbox."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import unicodedata

MAX_REQUEST_BYTES = 2048
MAX_TEXT_CHARS = 240
PROFILES = {"ultron-angry": "Uncle_Fu"}
ALLOWED_SUFFIXES = {".json", ".safetensors", ".txt"}
DENIED_KEYS = {"auto_map", "custom_pipelines", "trust_remote_code", "quantization_config"}


class BoundaryError(ValueError):
    """Deliberately contains no request payload or private paths."""


def unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise BoundaryError("duplicate-field")
        result[key] = value
    return result


def parse_request(raw: bytes) -> dict[str, str]:
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_REQUEST_BYTES:
        raise BoundaryError("request-size")
    try:
        value = json.loads(raw.decode("utf-8", errors="strict"), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise BoundaryError("invalid-request") from error
    if not isinstance(value, dict) or set(value) != {"profile", "text"}:
        raise BoundaryError("invalid-fields")
    if not isinstance(value["profile"], str) or value["profile"] not in PROFILES:
        raise BoundaryError("invalid-profile")
    text = value["text"]
    if not isinstance(text, str) or not 1 <= len(text) <= MAX_TEXT_CHARS or not text.strip():
        raise BoundaryError("invalid-text")
    if any(unicodedata.category(char).startswith("C") for char in text):
        raise BoundaryError("control-character")
    # Never let user text introduce Qwen role/audio/control tokens.
    if "<|" in text or "|>" in text:
        raise BoundaryError("control-token")
    return {"profile": value["profile"], "text": text.strip()}


def validate_config(value: object, depth: int = 0) -> None:
    if depth > 32:
        raise BoundaryError("config-depth")
    if isinstance(value, dict):
        for key, item in value.items():
            if key in DENIED_KEYS or key.startswith("_attn_implementation"):
                raise BoundaryError("unsafe-config")
            if key in {"attn_implementation", "_attn_implementation"} and item not in {None, "sdpa", "eager"}:
                raise BoundaryError("unsafe-attention")
            validate_config(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            validate_config(item, depth + 1)


def regular_file(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or path.is_junction():
        raise BoundaryError("unsafe-file")


def verify_model(root: Path, manifest: dict) -> None:
    if not root.is_absolute() or not root.is_dir() or root.is_symlink() or root.is_junction():
        raise BoundaryError("invalid-model-root")
    if manifest.get("schema") != "ultron.model-lock.v1" or not isinstance(manifest.get("files"), list):
        raise BoundaryError("invalid-lock")
    entries = manifest["files"]
    if not 1 <= len(entries) <= 64:
        raise BoundaryError("invalid-lock")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"path", "bytes", "sha256"}:
            raise BoundaryError("invalid-lock-entry")
        name = entry["path"]
        if (not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_./-]+", name)
                or PurePosixPath(name).is_absolute() or ".." in name.split("/") or name in seen):
            raise BoundaryError("unsafe-model-path")
        seen.add(name)
        target = root.joinpath(*name.split("/"))
        if target.suffix not in ALLOWED_SUFFIXES:
            raise BoundaryError("unsafe-model-type")
        if (not isinstance(entry["bytes"], int) or isinstance(entry["bytes"], bool)
                or not 0 < entry["bytes"] <= 4_000_000_000
                or not isinstance(entry["sha256"], str)
                or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])):
            raise BoundaryError("invalid-lock-entry")
        for parent in target.parents:
            if parent == root:
                break
            if parent.is_symlink() or parent.is_junction():
                raise BoundaryError("unsafe-model-path")
        regular_file(target)
        if target.resolve().is_relative_to(root.resolve()) is False:
            raise BoundaryError("unsafe-model-path")
        if target.stat().st_size != entry["bytes"]:
            raise BoundaryError("model-size-mismatch")
        with target.open("rb") as handle:
            if hashlib.file_digest(handle, "sha256").hexdigest() != entry["sha256"]:
                raise BoundaryError("model-hash-mismatch")
        if target.suffix == ".json":
            if entry["bytes"] > 12_000_000:
                raise BoundaryError("config-size")
            validate_config(json.loads(target.read_text(encoding="utf-8"), object_pairs_hook=unique_object))
    if not {"config.json", "model.safetensors"}.issubset(seen):
        raise BoundaryError("model-files-missing")
    # Reject unpinned loadable inputs, not just modified known files.
    for target in root.rglob("*"):
        name = target.relative_to(root).as_posix()
        if name.startswith(".cache/"):
            continue
        if target.is_symlink() or target.is_junction():
            raise BoundaryError("unsafe-model-path")
        if target.is_file() and target.suffix.lower() in {".bin", ".pt", ".pth", ".pkl", ".pickle", ".py"}:
            raise BoundaryError("unsafe-model-type")
        if target.is_file() and target.suffix in ALLOWED_SUFFIXES and name not in seen:
            raise BoundaryError("unpinned-model-input")


def offline_environment() -> dict[str, str]:
    # Do not inherit API keys, proxy URLs, PYTHONPATH or other provider settings.
    result = {key: os.environ[key] for key in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP") if key in os.environ}
    result.update({
        "CUDA_VISIBLE_DEVICES": "", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1", "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
        "DO_NOT_TRACK": "1", "TOKENIZERS_PARALLELISM": "false", "OMP_NUM_THREADS": "4",
        "USERNAME": "ultron-tts",
    })
    if result.get("TEMP"):
        result["NUMBA_CACHE_DIR"] = str(Path(result["TEMP"]) / "numba")
    return result


def deny_network(event: str, _args: tuple) -> None:
    if event in {"socket.connect", "socket.connect_ex", "socket.getaddrinfo", "socket.sendto", "socket.bind"}:
        raise PermissionError("network-disabled")
