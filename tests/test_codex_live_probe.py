"""Read-only wire boundaries for the temporary realtime compatibility probe."""
import importlib.util
import io
from pathlib import Path
import struct
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "codex_live_probe.py"
SESSION = "11111111-1111-4111-8111-111111111111"


class Transport:
    def __init__(self, incoming):
        self.incoming = iter(incoming)
        self.outbound = []

    def send_json(self, value):
        self.outbound.append(value)

    def recv_json(self):
        return next(self.incoming)


class LiveProbeTests(unittest.TestCase):
    def probe(self):
        self.assertTrue(SCRIPT.is_file(), "Realtime probe is not implemented")
        spec = importlib.util.spec_from_file_location("live_probe", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_native_wait_flags_and_clear_are_distinct_states(self):
        probe = self.probe()
        for native, flags, wanted in [
            ("active", ["waitingOnApproval"], "attn"),
            ("active", ["waitingOnUserInput"], "attn"),
            ("active", [], "run"), ("idle", [], "stby"),
            ("systemError", [], "unavailable"), ("notLoaded", [], "unavailable"),
        ]:
            with self.subTest(native=native, flags=flags):
                result = probe.sanitize_thread({"id": SESSION, "status": {"type": native, "activeFlags": flags},
                                                "preview": "SECRET", "turns": [{"text": "SECRET"}]}, 12)
                self.assertEqual(result["state"], wanted)
                self.assertNotIn("SECRET", str(result))

    def test_observer_does_not_resume_subscribe_or_fetch_turns(self):
        probe = self.probe()
        transport = Transport([
            {"id": 1, "result": {}},
            {"id": 2, "result": {"data": [SESSION]}},
            {"id": 3, "result": {"thread": {"id": SESSION, "status": {"type": "idle"}, "preview": "SECRET"}}},
        ])
        observer = probe.Observer(transport)
        observer.initialize()
        snapshots = observer.poll()
        self.assertEqual(snapshots[0]["state"], "stby")
        self.assertNotIn("SECRET", str(snapshots))
        self.assertEqual([v["method"] for v in transport.outbound],
                         ["initialize", "initialized", "thread/loaded/list", "thread/read"])
        self.assertEqual(transport.outbound[-1]["params"], {"threadId": SESSION, "includeTurns": False})

    def test_mutating_rpc_is_rejected_before_transmission(self):
        probe = self.probe()
        transport = Transport([])
        observer = probe.Observer(transport)
        for method in ("thread/resume", "turn/start", "thread/archive", "thread/shellCommand"):
            with self.assertRaises(ValueError):
                observer.rpc(method, {})
        self.assertEqual(transport.outbound, [])

    def test_pending_server_request_is_not_answered_by_observer(self):
        probe = self.probe()
        transport = Transport([
            {"method": "item/commandExecution/requestApproval", "id": 9, "params": {"command": "SECRET"}},
            {"id": 1, "result": {}},
        ])
        probe.Observer(transport).initialize()
        self.assertEqual([v["method"] for v in transport.outbound], ["initialize", "initialized"])
        self.assertNotIn("SECRET", str(transport.outbound))

    def test_client_frames_are_masked_and_recover_original_payload(self):
        probe = self.probe()
        frame = probe.encode_frame(b"hello")
        self.assertEqual(frame[:2], b"\x81\x85")
        mask = frame[2:6]
        self.assertEqual(bytes(value ^ mask[i % 4] for i, value in enumerate(frame[6:])), b"hello")

    def test_server_frame_roundtrip_and_truncation(self):
        probe = self.probe()
        self.assertEqual(probe.read_frame(io.BytesIO(b"\x81\x05hello")), (True, 1, b"hello"))
        with self.assertRaises(ConnectionError):
            probe.read_frame(io.BytesIO(b"\x81\x05hel"))

    def test_oversized_frame_rejected_before_payload_read(self):
        probe = self.probe()
        stream = io.BytesIO(b"\x81\x7f" + struct.pack("!Q", 2097153))
        with self.assertRaises(ValueError):
            probe.read_frame(stream)
        self.assertEqual(stream.tell(), 10)

    def test_probe_refuses_non_loopback_endpoint(self):
        probe = self.probe()
        with self.assertRaises(ValueError):
            probe.LocalWebSocket("ws://example.com:4500", "A" * 64)


if __name__ == "__main__":
    unittest.main()
