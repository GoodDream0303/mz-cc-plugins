from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))

from session_types import SessionSnapshot


LEFT = (120, (42, 10, 4, 610))
RIGHT = (120, (42, 10, 4, 615))
OTHER = (150, (42, 11, 4, 620))
SID = '11111111-2222-4333-8444-123456789abc'


class TerminalTabTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'win32', 'Windows UI Automation')
    def test_native_client_exposes_bounded_uiautomation_interface(self):
        from terminal_tabs import _automation

        with _automation() as client:
            self.assertTrue(client)

    def test_reorders_bound_rows_using_positions_within_each_window(self):
        from monitor import order_by_terminal

        right = SessionSnapshot('codex', 'right', terminal_tab=RIGHT)
        left = SessionSnapshot('codex', 'left', terminal_tab=LEFT)
        other_window = SessionSnapshot('codex', 'other', terminal_tab=OTHER)
        unbound = SessionSnapshot('claude', 'background')
        rows = [right, other_window, unbound, left]
        self.assertEqual(order_by_terminal(rows, {LEFT: 10, RIGHT: 200, OTHER: 1}),
                         [left, other_window, unbound, right])
        self.assertEqual(order_by_terminal(rows, {LEFT: 200, RIGHT: 10, OTHER: 1}), rows)
        self.assertEqual(order_by_terminal(rows, {}), rows)

    def test_ambiguous_tab_claim_stays_in_start_order(self):
        from monitor import order_by_terminal

        right = SessionSnapshot('codex', 'right', terminal_tab=RIGHT)
        first = SessionSnapshot('codex', 'first', terminal_tab=LEFT)
        second = SessionSnapshot('codex', 'second', terminal_tab=LEFT)
        rows = [right, first, second]
        self.assertEqual(order_by_terminal(rows, {LEFT: 10, RIGHT: 200}), rows)

    def test_session_start_binds_the_registered_tab_and_resume_can_change_it(self):
        from codex_lifecycle import capture_session_start, session_selection
        from terminal_tabs import TAB_ENV

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / 'codex'
            runtime = root / 'scope'
            path = home / 'sessions' / ('rollout-2026-11-18T00-00-00-' + SID + '.jsonl')
            path.parent.mkdir(parents=True)
            path.touch()
            payload = {'session_id': SID, 'hook_event_name': 'SessionStart',
                       'source': 'startup', 'transcript_path': str(path)}
            with patch('codex_close.session_owner', return_value={'pid': 101, 'started': 3}):
                connection = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
                other = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
                cases = [('120,42,10,4,610', connection, {SID: LEFT}),
                         ('150,42,11,4,620', connection, {SID: OTHER}),
                         ('150,42,11,4,620', other, {}),
                         ('invalid', connection, {})]
                for raw, registered, expected in cases:
                    env = {TAB_ENV: raw, 'AI_CHAT_SCOPE_TERMINAL_SESSION': registered,
                           'WT_SESSION': connection}
                    with self.subTest(tab=raw, registered=registered), patch.dict(os.environ, env):
                        capture_session_start(runtime, home, payload)
                        self.assertEqual(session_selection(runtime, home, {SID: path}),
                                         ({SID}, expected))
                        payload['source'] = 'resume'


if __name__ == '__main__':
    unittest.main()
