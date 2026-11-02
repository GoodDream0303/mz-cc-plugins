from pathlib import Path
import sys
import unittest

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))


class SessionTypeTests(unittest.TestCase):
    def types(self):
        self.assertTrue((SRC / "session_types.py").is_file(), "Snapshot types are not implemented")
        from session_types import SessionSnapshot, to_gui_row
        return SessionSnapshot, to_gui_row

    def test_cross_provider_same_id_has_distinct_key(self):
        Snapshot, _ = self.types()
        self.assertNotEqual(Snapshot("claude", "same").key, Snapshot("codex", "same").key)

    def test_codex_has_no_fake_pid_or_close_capability(self):
        Snapshot, row = self.types()
        result = row(Snapshot("codex", "same", title="Example"))
        self.assertIsNone(result["pid"])
        self.assertNotIn("close", result["capabilities"])
        self.assertEqual(result["label"], "Example")


if __name__ == "__main__":
    unittest.main()
