import json
from pathlib import Path
import sys
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))


class ClaudeSourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="scope-claude-test-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        (self.home / "sessions").mkdir()

    def source(self):
        self.assertTrue((SRC / "claude_source.py").is_file(), "Claude source has not been extracted")
        from claude_source import ClaudeSource
        return ClaudeSource(self.home)

    def write_session(self, pid, **extra):
        data = {"pid": pid, "sessionId": "session-" + str(pid), "cwd": "C:\\repo", "status": "idle", "startedAt": pid}
        data.update(extra)
        path = self.home / "sessions" / (str(pid) + ".json")
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_parked_hides_only_when_live_bg_present(self):
        source = self.source()
        self.write_session(1, parkedJobId="job")
        self.assertEqual([s.pid for s in source.poll()], [1])
        bg = self.write_session(2, kind="bg", jobId="job", spare=True)
        self.assertEqual([s.pid for s in source.poll()], [1])
        self.write_session(2, kind="bg", jobId="job", spare=False)
        self.assertEqual([s.pid for s in source.poll()], [2])
        bg.unlink()
        self.assertEqual([s.pid for s in source.poll()], [1])

    def test_waiting_overrides_background(self):
        source = self.source()
        self.write_session(2, kind="bg", jobId="job", status="waiting")
        self.assertEqual(source.poll()[0].state, "attn")

    def test_explicit_title_beats_ai_title(self):
        source = self.source()
        self.write_session(1, name="User title", nameSource="user")
        project = self.home / "projects" / "C--repo"
        project.mkdir(parents=True)
        (project / "session-1.jsonl").write_text(json.dumps({"type": "ai-title", "aiTitle": "AI title"}) + "\n", encoding="utf-8")
        self.assertEqual(source.poll()[0].title, "User title")
        self.write_session(1, name="derived-slug", nameSource="derived")
        self.assertEqual(source.poll()[0].title, "AI title")

    def test_partial_session_keeps_previous_snapshot(self):
        source = self.source()
        path = self.write_session(1, status="waiting")
        self.assertEqual(source.poll()[0].state, "attn")
        path.write_text('{"pid":', encoding="utf-8")
        self.assertEqual(source.poll()[0].state, "attn")

    def test_readers_do_not_share_home_or_closed_state(self):
        source = self.source()
        self.write_session(1)
        source.mark_closed(1, "session-1")
        self.assertEqual(source.poll(), [])
        self.assertEqual(len(self.source().poll()), 1)

    def test_same_session_id_keeps_latest_instance(self):
        source = self.source()
        self.write_session(1, sessionId="same")
        self.write_session(2, sessionId="same")
        self.assertEqual([s.pid for s in source.poll()], [2])

    def test_bad_registry_values_do_not_block_normal_sessions(self):
        self.write_session(1,status='busy')
        for bad in ([],{'pid':[]},{'pid':2,'sessionId':[]},{'pid':2,'sessionId':'two','cwd':[]},{'pid':2,'sessionId':'two','startedAt':10**400}):
            with self.subTest(bad_type=type(bad).__name__):
                (self.home/'sessions/2.json').write_text(json.dumps(bad),encoding='utf-8')
                rows=self.source().poll()
                self.assertEqual([(r.pid,r.state) for r in rows],[(1,'run')])

    def test_bad_rewrite_does_not_replace_last_valid_registry(self):
        path=self.write_session(1,status='waiting')
        source=self.source();self.assertEqual(source.poll()[0].state,'attn')
        path.write_text('[]',encoding='utf-8')
        self.assertEqual(source.poll()[0].state,'attn')

    def test_bad_job_objects_and_flags_do_not_block_other_rows(self):
        self.write_session(1)
        self.write_session(2,kind='bg',jobId='job',status='busy')
        folder=self.home/'jobs/job';folder.mkdir(parents=True)
        for value in ([],{'sessionId':[]},{'sessionId':'session-2','state':'working','respawnFlags':123}):
            (folder/'state.json').write_text(json.dumps(value),encoding='utf-8')
            self.assertEqual([r.pid for r in self.source().poll()],[1,2])

    def test_bad_title_items_are_skipped(self):
        self.write_session(1,name='derived',nameSource='derived')
        folder=self.home/'projects/C--repo';folder.mkdir(parents=True)
        records=[{'type':'ai-title','aiTitle':'Valid title'},['ai-title'],{'type':'ai-title','aiTitle':[]}]
        (folder/'session-1.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records),encoding='utf-8')
        self.assertEqual(self.source().poll()[0].title,'Valid title')


if __name__ == "__main__":
    unittest.main()
