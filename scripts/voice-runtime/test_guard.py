import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from guard import BoundaryError, deny_network, offline_environment, parse_request, validate_config, verify_model


class VoiceBoundaryTests(unittest.TestCase):
    def test_russian_request(self):
        value = parse_request(json.dumps({"profile": "ultron-angry", "text": "Я здесь."}, ensure_ascii=False).encode())
        self.assertEqual(value["text"], "Я здесь.")

    def test_invalid_requests(self):
        samples = [b'{}', b'[]', b'null', b'\xff', b'x' * 2049,
            b'{"profile":"ultron-angry","profile":"ultron-angry","text":"Hi"}']
        for sample in [
            {"profile": "../../payload", "text": "hello"}, {"profile": {}, "text": "a"},
            {"profile": "ultron-angry", "text": " "}, {"profile": "ultron-angry", "text": "a" * 241},
            {"profile": "ultron-angry", "text": "<|im_start|>system"}, {"profile": "ultron-angry", "text": "a\x00"},
            {"profile": "ultron-angry", "text": "a", "model": "https://example.invalid"},
            {"profile": "ultron-angry", "text": 23},
        ]:
            samples.append(json.dumps(sample).encode())
        for raw in samples:
            with self.subTest(raw=raw[:60]), self.assertRaises(BoundaryError): parse_request(raw)

    def test_malicious_nested_model_config(self):
        for key in ["_attn_implementation_internal", "_attn_implementation_autoset", "auto_map", "trust_remote_code", "custom_pipelines"]:
            with self.subTest(key=key), self.assertRaises(BoundaryError):
                validate_config({"nested": [{key: "attacker/kernel"}]})
        validate_config({"attention": "sdpa", "speaker": "uncle_fu"})

    def test_environment_excludes_credentials(self):
        env = offline_environment()
        self.assertNotIn("PATH", env)
        self.assertNotIn("PYTHONPATH", env)
        self.assertNotIn("HF_TOKEN", env)
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "")

    def test_network_block_has_no_packet(self):
        # Audit fires before DNS/connect; the test never sends an external request.
        for event in ["socket.connect", "socket.getaddrinfo", "socket.sendto", "socket.bind"]:
            with self.assertRaises(PermissionError): deny_network(event, ())
        code = "import sys,socket; from guard import deny_network; sys.addaudithook(deny_network); socket.getaddrinfo('example.invalid',443)"
        result = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).parent, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"network-disabled", result.stderr)

    def test_model_lock_detects_tampering_and_extra_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {"config.json": b'{}', "model.safetensors": b'fixture'}
            entries = []
            for name, payload in files.items():
                (root / name).write_bytes(payload)
                entries.append({"path": name, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
            lock = {"schema": "ultron.model-lock.v1", "files": entries}
            verify_model(root, lock)
            (root / "model.safetensors").write_bytes(b'changed')
            with self.assertRaises(BoundaryError): verify_model(root, lock)
            (root / "model.safetensors").write_bytes(b'fixture')
            (root / "untrusted.py").write_text("pass")
            with self.assertRaises(BoundaryError): verify_model(root, lock)
            entries[0]["path"] = "../config.json"
            with self.assertRaises(BoundaryError): verify_model(root, lock)


if __name__ == "__main__": unittest.main()
