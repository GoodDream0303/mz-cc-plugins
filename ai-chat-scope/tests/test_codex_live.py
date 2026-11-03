from pathlib import Path
import sys
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1]/'src'
sys.path.insert(0, str(SRC))
SID = '11111111-1111-4111-8111-111111111111'
CHILD = '22222222-2222-4222-8222-222222222222'


class Wire:
    def __init__(self):
        self.sent = []
        self.replies = iter([
            {'id':1,'result':{}},
            {'id':2,'result':{'data':[SID, CHILD]}},
            {'id':3,'result':{'thread':{'id':SID,'threadSource':'user','parentThreadId':None,'source':'vscode','cwd':'C:/repo','name':'Native title','status':{'type':'active','activeFlags':['waitingOnApproval']},'preview':'SECRET'}}},
            {'id':4,'result':{'thread':{'id':CHILD,'threadSource':'subagent','parentThreadId':SID,'status':{'type':'idle'}}}},
        ])
    def send_json(self, value):self.sent.append(value)
    def recv_json(self):return next(self.replies)
    def close(self):pass


class LiveTests(unittest.TestCase):
    def client_type(self):
        self.assertTrue((SRC/'codex_live.py').exists(), 'Realtime product source is not implemented')
        from codex_live import CodexLiveClient
        return CodexLiveClient

    def test_dedicated_cli_endpoint_accepts_vscode_source_but_not_subagents(self):
        Client = self.client_type()
        with tempfile.TemporaryDirectory(prefix='scope-live-test-') as raw:
            token = Path(raw)/'token';token.write_text('A'*64)
            wire = Wire()
            client = Client('ws://127.0.0.1:12345', token, transport_factory=lambda endpoint, secret: wire)
            rows = client.poll()
            self.assertTrue(client.available)
            self.assertEqual(list(rows), [SID])
            self.assertEqual(rows[SID]['state'], 'attn')
            self.assertNotIn('SECRET', repr(rows))
            self.assertEqual([r['method'] for r in wire.sent], ['initialize','initialized','thread/loaded/list','thread/read','thread/read'])

    def test_connection_failure_is_explicit_and_does_not_expose_credentials(self):
        Client = self.client_type()
        with tempfile.TemporaryDirectory(prefix='scope-live-test-') as raw:
            token = Path(raw)/'token';token.write_text('A'*64)
            def fail(endpoint, secret):raise OSError('SECRET')
            client = Client('ws://127.0.0.1:12345', token, transport_factory=fail)
            self.assertEqual(client.poll(), {})
            self.assertFalse(client.available)
            self.assertTrue(client.diagnostics)
            self.assertNotIn('SECRET', repr(client.diagnostics))


if __name__ == '__main__':
    unittest.main()
