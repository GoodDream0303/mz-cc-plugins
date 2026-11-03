import json
from pathlib import Path
import sys
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))


class JsonlTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="scope-jsonl-test-")
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / "events.jsonl"

    def reader(self, **kwargs):
        self.assertTrue((SRC / "jsonl_reader.py").exists(), "JSONL reader is not implemented")
        from jsonl_reader import JsonlReader
        return JsonlReader(self.path, **kwargs)

    def test_budget_and_split_utf8_and_partial_tail(self):
        self.path.write_bytes(json.dumps({"text": "中文🙂"}, ensure_ascii=False).encode() + b"\n" + b'{"n":')
        reader = self.reader()
        records = []
        for _ in range(100):
            before = reader.offset
            records.extend(reader.read(max_bytes=2))
            self.assertLessEqual(reader.offset - before, 2)
            if reader.offset == self.path.stat().st_size:
                break
        self.assertEqual(records, [{"text": "中文🙂"}])
        self.assertFalse(reader.caught_up)
        with self.path.open("ab") as stream:
            stream.write(b'1}\n')
        self.assertEqual(reader.read(), [{"n": 1}])
        self.assertTrue(reader.caught_up)

    def test_oversized_and_invalid_records_do_not_hide_later_events(self):
        self.path.write_bytes(b'x'*100 + b'\nnot JSON\n{"n":2}\n')
        reader = self.reader(max_line_bytes=32)
        result = []
        for _ in range(20):
            result.extend(reader.read(max_bytes=11))
            if reader.caught_up:
                break
        self.assertEqual(result, [{"n": 2}])

    def test_truncate_and_same_length_rewrite_reset_generation(self):
        self.path.write_bytes(b'{"n":1}\n')
        reader = self.reader()
        self.assertEqual(reader.read(), [{"n": 1}])
        generation = reader.generation
        self.path.write_bytes(b'{"n":2}\n')
        self.assertEqual(reader.read(), [{"n": 2}])
        self.assertGreater(reader.generation, generation)
        self.path.write_bytes(b'{}\n')
        self.assertEqual(reader.read(), [{}])

    def test_replacement_discards_old_partial_bytes(self):
        self.path.write_bytes(b'{"old":')
        reader = self.reader()
        self.assertEqual(reader.read(), [])
        other = self.path.with_suffix('.new')
        other.write_bytes(b'{"new":true}\n')
        other.replace(self.path)
        self.assertEqual(reader.read(), [{"new": True}])


if __name__ == '__main__':
    unittest.main()
