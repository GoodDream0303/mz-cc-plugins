"""Behavior checks for the temporary, metadata-only compatibility probe."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "codex_scope_probe.py"
SESSION = "11111111-1111-4111-8111-111111111111"


class ProbeTests(unittest.TestCase):
    def probe(self):
        self.assertTrue(SCRIPT.is_file(), "Compatibility probe is not implemented")
        spec = importlib.util.spec_from_file_location("scope_probe", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_probe_drops_prompt_arguments_and_response(self):
        result = self.probe().sanitize_hook({
            "session_id": SESSION, "hook_event_name": "PermissionRequest",
            "turn_id": "turn-1", "tool_name": "Bash",
            "prompt": "SECRET_PROMPT", "tool_input": {"command": "SECRET_COMMAND"},
            "last_assistant_message": "SECRET_RESPONSE", "cwd": "SECRET_PATH",
        }, 123)
        self.assertEqual(result, {
            "schema_version": 1, "source": "hook", "session_id": SESSION,
            "hook_event_name": "PermissionRequest", "turn_id": "turn-1",
            "tool_name": "Bash", "observed_ns": 123,
        })
        self.assertNotIn("SECRET", json.dumps(result))

    def test_probe_rejects_oversized_input(self):
        probe = self.probe()
        stream = io.BytesIO(b"x" * (1048576 + 1))
        with self.assertRaises(ValueError):
            probe.read_hook(stream)
        self.assertEqual(stream.tell(), 1048577)

    def test_report_does_not_treat_tool_completion_as_approval(self):
        probe = self.probe()
        records = [probe.sanitize_hook({
            "session_id": SESSION, "turn_id": "turn-1",
            "hook_event_name": name, "tool_name": "Bash",
        }, stamp) for name, stamp in [("PermissionRequest", 10), ("PostToolUse", 20)]]
        report = probe.summarize_records(records)
        self.assertFalse(report["approval_resume_proven"])
        self.assertEqual(report["hook_event_counts"], {"PermissionRequest": 1, "PostToolUse": 1})

    def test_rollout_capture_keeps_shape_without_conversation(self):
        probe = self.probe()
        result = probe.sanitize_rollout({
            "timestamp": "2026-11-02T00:00:00Z", "type": "response_item",
            "payload": {"type": "function_call", "name": "request_user_input",
                        "call_id": "call-1", "arguments": "SECRET_QUESTION"},
        }, 55)
        self.assertEqual(result, {
            "schema_version": 1, "source": "rollout", "record_type": "response_item",
            "event_type": "function_call", "tool_name": "request_user_input",
            "tool_use_id": "call-1", "observed_ns": 55,
        })

    def test_invalid_identity_cannot_be_used_as_a_path(self):
        probe = self.probe()
        with self.assertRaises(ValueError):
            probe.sanitize_hook({"session_id": "../../outside", "hook_event_name": "Stop"}, 1)

    def test_failed_hook_is_silent_and_successful(self):
        self.probe()
        with tempfile.TemporaryDirectory(prefix="scope-probe-test-") as temporary:
            result = subprocess.run([
                sys.executable, "-B", str(SCRIPT), "--hook", "--root", temporary,
            ], input=b"not JSON SECRET", capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout), {})
            self.assertEqual(result.stderr, b"")
            self.assertEqual(list(Path(temporary).iterdir()), [])

    def test_prepare_preserves_existing_project_hook_configuration(self):
        probe = self.probe()
        with tempfile.TemporaryDirectory(prefix="scope-probe-test-") as temporary:
            root = Path(temporary)
            hooks = root / ".codex" / "hooks.json"
            hooks.parent.mkdir()
            hooks.write_text('{"preserve":true}', encoding="utf-8")
            with self.assertRaises(FileExistsError):
                probe.prepare_probe(root)
            self.assertEqual(hooks.read_text(encoding="utf-8"), '{"preserve":true}')

    def test_prepare_generates_runnable_hook_with_quoted_directory(self):
        probe = self.probe()
        with tempfile.TemporaryDirectory(prefix="scope-probe-test-") as temporary:
            root = Path(temporary) / "space ' 中文"
            probe.prepare_probe(root)
            config = json.loads((root / ".codex" / "hooks.json").read_text(encoding="utf-8"))
            entry = config["hooks"]["PermissionRequest"][0]["hooks"][0]
            if sys.platform == "win32":
                command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", entry["commandWindows"]]
            else:
                command = ["sh", "-c", entry["command"]]
            payload = {"session_id": SESSION, "hook_event_name": "PermissionRequest",
                       "tool_input": {"command": "SECRET_COMMAND"}}
            result = subprocess.run(command, input=json.dumps(payload).encode(), capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
            self.assertEqual(json.loads(result.stdout), {})
            records = list((root / "probe-events").glob("*.json"))
            self.assertEqual(len(records), 1)
            self.assertNotIn("SECRET", records[0].read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
