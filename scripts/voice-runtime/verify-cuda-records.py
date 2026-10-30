"""Verify local CUDA package files against wheel RECORD without importing them."""
import base64
import csv
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path

checked = 0
for name, version in [("torch", "2.11.0+cu128"), ("torchaudio", "2.11.0+cu128")]:
    dist = metadata.distribution(name)
    if dist.version != version:
        raise RuntimeError("unexpected-cuda-version")
    root = Path(dist.locate_file("")).resolve()
    for filename, digest, size in csv.reader(dist.read_text("RECORD").splitlines()):
        if not digest:
            continue
        # Entry-point scripts belong to the original venv. They are never run
        # or copied; validate every imported module/library/data file instead.
        if filename.startswith("../"):
            continue
        target = root.joinpath(filename)
        if target.is_symlink() or not target.resolve().is_relative_to(root):
            raise RuntimeError("unsafe-record-path")
        algorithm, expected = digest.split("=", 1)
        if algorithm != "sha256" or target.stat().st_size != int(size):
            raise RuntimeError("record-size-mismatch")
        with target.open("rb") as source:
            actual = base64.urlsafe_b64encode(hashlib.file_digest(source, "sha256").digest()).rstrip(b"=").decode()
        if actual != expected:
            raise RuntimeError("record-hash-mismatch")
        checked += 1
print(json.dumps({"verifiedFiles": checked, "torch": metadata.version("torch"),
    "torchaudio": metadata.version("torchaudio"), "transformers": metadata.version("transformers"),
    "provenance": "local wheel RECORD; not publisher signature"}))
