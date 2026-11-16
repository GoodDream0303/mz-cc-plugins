import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

SRC = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(SRC))
A, B, C = [str(uuid.UUID(int=number)) for number in (1, 2, 3)]


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='scope-lifecycle-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.home = self.base / 'home'
        self.runtime = self.base / 'runtime'
        (self.home / 'sessions').mkdir(parents=True)
        self.paths = {}
        for sid in (A, B, C):
            path = self.home / 'sessions' / ('rollout-test-' + sid + '.jsonl')
            path.write_text(json.dumps({'type':'session_meta', 'payload':{
                'id':sid, 'source':'cli', 'thread_source':'user', 'cwd':'C:/repo',
                'timestamp':'2026-11-16T00:00:00Z'}}) + '\n')
            self.paths[sid] = path

    def module(self):
        self.assertTrue((SRC / 'codex_lifecycle.py').exists(), 'Lifecycle capture is not implemented')
        return importlib.import_module('codex_lifecycle')

    def start(self, sid, stamp, owner=None, source='startup', path=None):
        module = self.module()
        with patch('codex_close.session_owner', return_value=owner or {'pid':123, 'started':456}, create=True), \
             patch.object(module.time, 'monotonic_ns', return_value=stamp):
            module.capture_session_start(self.runtime, self.home, {
                'hook_event_name':'SessionStart', 'session_id':sid, 'source':source,
                'transcript_path':str(path or self.paths[sid]), 'prompt':'SECRET'})

    def visible(self, paths=None):
        return self.module().current_session_ids(self.runtime, self.home, paths or self.paths)

    def test_clear_selects_current_thread_and_keeps_an_independent_cli(self):
        self.start(A, 10)
        self.start(C, 15, owner={'pid':999, 'started':888})
        self.start(B, 20, source='clear')
        self.assertEqual(self.visible(), {B, C})
        self.assertEqual(self.visible(), {B, C}, 'A new file-only observer must read the same state')

    def test_resume_selects_old_thread_using_its_new_recording(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        newer = self.paths[A].with_name('rollout-test-' + A + '_' + C + '.jsonl')
        newer.write_bytes(self.paths[A].read_bytes())
        self.paths[A] = newer
        self.start(A, 30, source='resume', path=newer)
        self.assertEqual(self.visible({A:newer, B:self.paths[B]}), {A})

    @unittest.skipUnless(sys.platform == 'win32', 'Windows extended-length transcript path')
    def test_resume_accepts_extended_drive_path_without_changing_data_root(self):
        self.start(A,10)
        self.start(B,20,source='clear')
        self.start(A,30,source='resume',path=Path('\\\\?\\'+str(self.paths[A])))
        self.assertEqual(self.visible({A:self.paths[A],B:self.paths[B]}),{A})

    def test_reused_pid_does_not_group_different_process_incarnations(self):
        self.start(A, 10)
        self.start(B, 20, owner={'pid':123, 'started':457}, source='clear')
        self.assertEqual(self.visible({A:self.paths[A], B:self.paths[B]}), {A, B})

    def test_failed_same_recording_resume_invalidates_previous_identity_marker(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        with patch('codex_close.session_owner',side_effect=OSError('fixture query failed')):
            with self.assertRaises(OSError):
                self.module().capture_session_start(self.runtime,self.home,{
                    'hook_event_name':'SessionStart','session_id':A,'source':'resume',
                    'transcript_path':str(self.paths[A])})
        self.assertEqual(self.visible({A:self.paths[A], B:self.paths[B]}),{A,B})

    def test_running_and_waiting_root_rows_remain_visible(self):
        from codex_source import CodexSource
        locks = self.home/'thread-writer-locks'
        locks.mkdir()
        for sid in (A,B):(locks/(sid+'.lock')).touch()
        self.start(A,10)
        self.start(B,20,source='clear')
        header = self.paths[A].read_text()
        started = {'type':'event_msg','payload':{'type':'task_started','turn_id':'running'}}
        waiting = [started,
            {'type':'event_msg','payload':{'type':'item_completed','turn_id':'running','item':{
                'type':'AgentMessage','id':'question','questions':[{'title':'Choose'}]}}},
            {'type':'event_msg','payload':{'type':'task_complete','turn_id':'running'}}]
        for expected,events in [('run',[started]),('attn',waiting)]:
            with self.subTest(state=expected):
                self.paths[A].write_text(header+''.join(json.dumps(r)+'\n' for r in events))
                source = CodexSource(self.home,lock_probe=lambda p:'held',runtime_dir=self.runtime)
                try:
                    rows = source.poll()
                    self.assertEqual({r.session_id for r in rows},{A,B})
                    self.assertEqual(next(r.state for r in rows if r.session_id==A),expected)
                finally:source.close()

    def test_old_recording_marker_does_not_hide_resumed_thread_without_new_hook(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        newer = self.paths[A].with_name('rollout-test-' + A + '_' + C + '.jsonl')
        newer.write_bytes(self.paths[A].read_bytes())
        self.assertEqual(self.visible({A:newer, B:self.paths[B]}), {A, B})

    def test_missing_current_row_or_marker_keeps_the_previous_row(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        self.assertEqual(self.visible({A:self.paths[A]}), {A})
        self.assertIn(C, self.visible())

    def test_equal_timestamps_keep_both_threads(self):
        self.start(A, 10)
        self.start(B, 10, source='clear')
        self.assertEqual(self.visible({A:self.paths[A], B:self.paths[B]}), {A, B})

    def test_compact_and_unsafe_or_unknown_transcript_paths_do_not_query_processes(self):
        module = self.module()
        outside = str(self.base/('rollout-test-'+A+'.jsonl'))
        cases = [('compact',str(self.paths[A])), ('startup',None),
                 ('clear',outside), ('unknown',str(self.paths[A]))]
        if sys.platform == 'win32':
            cases.append(('resume','\\\\?\\'+outside))
        with patch('codex_close.session_owner', create=True) as lookup:
            for source, path in cases:
                module.capture_session_start(self.runtime,self.home,{
                    'hook_event_name':'SessionStart','session_id':A,'source':source,'transcript_path':path})
            lookup.assert_not_called()
        self.assertEqual(list(self.runtime.rglob('*.json')), [])

    def test_marker_retains_only_metadata_and_corruption_keeps_rows(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        files = list(self.runtime.rglob('lifecycle.json'))
        self.assertEqual(len(files), 2)
        for path in files:
            record = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(set(record), {'schema_version','session_id','start_source',
                                          'observed_ns','owner','recording_name'})
            self.assertNotIn('SECRET', path.read_text(encoding='utf-8'))
            if record['session_id'] == B:
                path.write_text('{invalid')
        self.assertEqual(self.visible({A:self.paths[A], B:self.paths[B]}), {A, B})

    def test_invalid_marker_field_types_never_interrupt_display(self):
        self.start(A, 10)
        self.start(B, 20, source='clear')
        path = next(p for p in self.runtime.rglob('lifecycle.json')
                    if json.loads(p.read_text())['session_id'] == B)
        original = json.loads(path.read_text())
        cases = [('start_source',[]), ('schema_version',True),
                 ('owner',{'pid':True,'started':456}), ('observed_ns',{}), ('recording_name',[])]
        for key, value in cases:
            with self.subTest(field=key):
                record = dict(original)
                record[key] = value
                path.write_text(json.dumps(record))
                try:
                    visible = self.visible({A:self.paths[A], B:self.paths[B]})
                except Exception as error:
                    self.fail('Invalid metadata interrupted display: '+str(error))
                self.assertEqual(visible, {A,B})

    def test_source_filters_after_current_row_is_ready_without_process_queries(self):
        from codex_source import CodexSource
        locks = self.home / 'thread-writer-locks'
        locks.mkdir()
        for sid in (A, B, C):
            (locks/(sid+'.lock')).touch()
        self.start(A, 10)
        self.start(C, 15, owner={'pid':999,'started':888})
        self.start(B, 20, source='clear')
        content = self.paths[B].read_bytes()
        self.paths[B].unlink()
        source = CodexSource(self.home,lock_probe=lambda p:'held',runtime_dir=self.runtime)
        self.addCleanup(source.close)
        with patch('codex_close.session_owner',side_effect=AssertionError('monitor queried process'),create=True):
            self.assertEqual({r.session_id for r in source.poll()}, {A,C})
            self.paths[B].write_bytes(content)
            with patch('codex_source.time.monotonic',return_value=10**12):
                self.assertEqual({r.session_id for r in source.poll()}, {B,C})
            restarted = CodexSource(self.home,lock_probe=lambda p:'held',runtime_dir=self.runtime)
            self.addCleanup(restarted.close)
            self.assertEqual({r.session_id for r in restarted.poll()}, {B,C})


if __name__ == '__main__':
    unittest.main()
