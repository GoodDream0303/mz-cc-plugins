import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

SRC = Path(__file__).resolve().parents[1]/'src'
sys.path.insert(0, str(SRC))
SID = '11111111-1111-4111-8111-111111111111'


class HookTests(unittest.TestCase):
    def modules(self):
        self.assertTrue((SRC/'codex_hooks.py').exists(), 'Product hook is not implemented')
        import codex_hooks, runtime_paths
        return codex_hooks, runtime_paths

    def test_hook_keeps_only_metadata_and_writes_in_tool_runtime(self):
        hooks, _ = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            root = Path(raw)
            output = io.StringIO()
            payload = {'session_id':SID,'hook_event_name':'PermissionRequest','turn_id':'turn-1','tool_name':'Bash','prompt':'SECRET','tool_input':{'command':'SECRET'}}
            status = hooks.hook_main(io.BytesIO(json.dumps(payload).encode()), output, root)
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(output.getvalue()), {})
            files = list(root.rglob('*.json'))
            self.assertEqual(len(files), 1)
            record = json.loads(files[0].read_text(encoding='utf-8'))
            self.assertEqual(record['hook_event_name'], 'PermissionRequest')
            self.assertNotIn('SECRET', files[0].read_text(encoding='utf-8'))

    def test_invalid_and_oversized_hook_never_blocks_cli(self):
        hooks, _ = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            for value in (b'bad JSON', b'x'*1048577, json.dumps({'session_id':'../../bad','hook_event_name':'Stop'}).encode()):
                out = io.StringIO()
                self.assertEqual(hooks.hook_main(io.BytesIO(value), out, Path(raw)), 0)
                self.assertEqual(json.loads(out.getvalue()), {})
            self.assertEqual(list(Path(raw).iterdir()), [])

    def test_concurrent_publications_are_complete_and_distinct(self):
        _, paths = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            root = Path(raw)
            def publish(number):
                return paths.publish_event(root, {'session_id':SID,'hook_event_name':'Stop','observed_ns':number})
            with ThreadPoolExecutor(max_workers=4) as pool:
                written = list(pool.map(publish, range(12)))
            self.assertEqual(len(set(written)), 12)
            self.assertEqual(sorted(json.loads(p.read_text())['observed_ns'] for p in written), list(range(12)))
            self.assertEqual(list(root.rglob('*.tmp')), [])

    def test_home_keys_normalize_aliases_and_isolate_homes(self):
        _, paths = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            root = Path(raw)
            self.assertEqual(paths.codex_home_key(root/'a'), paths.codex_home_key(root/'a'/'..'/'a'))
            self.assertNotEqual(paths.codex_home_key(root/'a'), paths.codex_home_key(root/'b'))

    def test_storage_failure_does_not_block_or_overwrite_existing_file(self):
        hooks, _ = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            root = Path(raw)/'not-a-directory';root.write_bytes(b'keep')
            out = io.StringIO()
            payload = {'session_id':SID,'hook_event_name':'Stop','last_assistant_message':'SECRET'}
            self.assertEqual(hooks.hook_main(io.BytesIO(json.dumps(payload).encode()), out, root), 0)
            self.assertEqual(json.loads(out.getvalue()), {})
            self.assertEqual(root.read_bytes(), b'keep')

    def test_publication_retains_a_bounded_recent_history(self):
        _, paths = self.modules()
        with tempfile.TemporaryDirectory(prefix='scope-hook-test-') as raw:
            root = Path(raw)
            for number in range(132):
                paths.publish_event(root, {'session_id':SID,'hook_event_name':'Stop','observed_ns':number})
            records = [json.loads(p.read_text()) for p in root.rglob('*.json')]
            self.assertLess(len(records), 132)
            self.assertIn(131, [r['observed_ns'] for r in records])


if __name__ == '__main__':
    unittest.main()
