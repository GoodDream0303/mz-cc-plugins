import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
import uuid

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))


class CodexSourceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="scope-codex-test-")
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        (self.home / 'thread-writer-locks').mkdir()
        (self.home / 'sessions').mkdir()
        self.locks = {}

    def source(self):
        self.assertTrue((SRC / 'codex_source.py').exists(), 'Codex source is not implemented')
        from codex_source import CodexSource
        return CodexSource(self.home, lock_probe=lambda p: self.locks.get(p.stem, 'released'))

    def session(self, number, source='cli', thread_source='user', events=None):
        sid = str(uuid.UUID(int=number))
        (self.home / 'thread-writer-locks' / (sid+'.lock')).touch()
        self.locks[sid] = 'held'
        meta = {'type':'session_meta','payload':{'id':sid,'cwd':'C:/repo','timestamp':'2026-11-02T00:00:00Z','source':source,'thread_source':thread_source}}
        path = self.home / 'sessions' / ('rollout-test-'+sid+'.jsonl')
        path.write_text(''.join(json.dumps(r)+'\n' for r in [meta]+(events or [])), encoding='utf-8')
        return sid, path

    def test_released_lock_is_not_live(self):
        sid, _ = self.session(1)
        source = self.source()
        self.assertEqual(len(source.poll()), 1)
        self.locks[sid] = 'released'
        self.assertEqual(source.poll(), [])

    def test_access_denied_is_not_held(self):
        sid, _ = self.session(1)
        self.locks[sid] = 'unavailable'
        source = self.source()
        self.assertEqual(source.poll(), [])
        self.assertTrue(source.diagnostics)

    def test_filters_subagent_and_non_cli(self):
        self.session(1, source={'subagent':{'thread_spawn':{}}}, thread_source='subagent')
        self.session(2, source='vscode')
        self.session(3)
        self.assertEqual([s.session_id for s in self.source().poll()], [str(uuid.UUID(int=3))])

    def test_active_lock_with_missing_log_is_reported(self):
        _, path = self.session(1)
        path.unlink()
        source = self.source()
        self.assertEqual(source.poll(), [])
        self.assertTrue(source.diagnostics)

    def test_session_index_name_updates_incrementally(self):
        sid, _ = self.session(1)
        index = self.home/'session_index.jsonl'
        index.write_text(json.dumps({'id':sid,'thread_name':'First'})+'\n', encoding='utf-8')
        source = self.source()
        self.assertEqual(source.poll()[0].title, 'First')
        with index.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps({'id':sid,'thread_name':'新名称'})+'\n')
        self.assertEqual(source.poll()[0].title, '新名称')

    def test_old_turn_completion_cannot_override_new_turn(self):
        _, path = self.session(1, events=[
            {'type':'event_msg','payload':{'type':'task_started','turn_id':'new'}},
            {'type':'event_msg','payload':{'type':'task_complete','turn_id':'old'}},
        ])
        source = self.source()
        self.assertEqual(source.poll()[0].state, 'run')
        with path.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps({'type':'event_msg','payload':{'type':'turn_aborted','turn_id':'new'}})+'\n')
        self.assertEqual(source.poll()[0].state, 'stby')

    def test_rewritten_index_drops_removed_title(self):
        sid, _ = self.session(1)
        index = self.home/'session_index.jsonl'
        index.write_text(json.dumps({'id':sid,'thread_name':'Removed title'})+'\n', encoding='utf-8')
        source = self.source()
        self.assertEqual(source.poll()[0].title, 'Removed title')
        index.write_bytes(b'')
        self.assertNotEqual(source.poll()[0].title, 'Removed title')

    def test_large_initial_metadata_reports_sync_instead_of_no_sessions(self):
        sid, path = self.session(1)
        metadata = {'type':'session_meta','payload':{'id':sid,'source':'cli','cwd':'C:/repo','base_instructions':'x'*300000}}
        path.write_text(json.dumps(metadata)+'\n', encoding='utf-8')
        source = self.source()
        self.assertEqual(source.poll(), [])
        self.assertTrue(source.diagnostics)
        self.assertEqual(len(source.poll()), 1)

    def junction(self, path, target):
        command = "New-Item -ItemType Junction -Path '" + str(path).replace("'", "''") + "' -Target '" + str(target).replace("'", "''") + "' | Out-Null"
        result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',command], capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, 'Could not create owned junction fixture')
        self.addCleanup(lambda: os.rmdir(path) if path.exists() else None)

    @unittest.skipUnless(sys.platform == 'win32', 'Windows junction fixture')
    def test_rollout_junction_cannot_escape_data_root(self):
        sid, path = self.session(1)
        outside = tempfile.TemporaryDirectory(prefix='scope-outside-test-')
        self.addCleanup(outside.cleanup)
        (Path(outside.name)/path.name).write_bytes(path.read_bytes())
        path.unlink()
        self.junction(self.home/'sessions'/'escape', Path(outside.name))
        self.assertEqual(self.source().poll(), [])

    @unittest.skipUnless(sys.platform == 'win32', 'Windows junction fixture')
    def test_previously_active_lock_directory_escape_is_not_probed(self):
        sid, _ = self.session(1)
        source = self.source()
        self.assertEqual(len(source.poll()), 1)
        locks = self.home/'thread-writer-locks'
        (locks/(sid+'.lock')).unlink();locks.rmdir()
        outside = tempfile.TemporaryDirectory(prefix='scope-outside-test-')
        self.addCleanup(outside.cleanup)
        (Path(outside.name)/(sid+'.lock')).write_bytes(b'owned fixture')
        self.junction(locks, Path(outside.name))
        probed = []
        source.lock_probe = lambda p: probed.append(p.resolve()) or 'held'
        source.poll()
        self.assertEqual(probed, [])


if __name__ == '__main__':
    unittest.main()
