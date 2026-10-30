"""Wire framing tests without loading any third-party package or model."""
import io
import json
import unittest
from guard import BoundaryError
from worker import read_request


class SessionTests(unittest.TestCase):
    def test_independent_lines_and_eof(self):
        payload = json.dumps({"profile": "ultron-angry", "text": "Привет."}).encode()
        source = io.BytesIO(payload + b"\n" + payload + b"\n")
        self.assertEqual(read_request(source, True)["text"], "Привет.")
        self.assertEqual(read_request(source, True)["text"], "Привет.")
        self.assertIsNone(read_request(source, True))

    def test_partial_oversize_duplicate_and_extra_fields(self):
        payloads = [b'{}', b'x' * 2049 + b'\n', b'{}\n',
                    b'{"profile":"ultron-angry","text":"ok","text":"bad"}\n',
                    b'{"profile":"ultron-angry","text":"ok","model":"remote"}\n']
        for payload in payloads:
            with self.subTest(payload=payload), self.assertRaises(BoundaryError):
                read_request(io.BytesIO(payload), True)

    def test_legacy_single_request_does_not_require_newline(self):
        payload = json.dumps({"profile": "ultron-angry", "text": "Привет."}).encode()
        self.assertEqual(read_request(io.BytesIO(payload), False)["text"], "Привет.")


if __name__ == "__main__":
    unittest.main()
