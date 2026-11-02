import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from handoff_runtime import resolve_context


class RuntimeTests(unittest.TestCase):
    def resolve(self, host, env=None, root=None, session_id=None):
        home_vars = {key: os.environ[key] for key in ('HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH') if key in os.environ}
        home_vars.update(env or {})
        with patch.dict(os.environ, home_vars, clear=True):
            return resolve_context(host, root, session_id)

    def test_codex_uses_own_session_even_with_claude_environment(self):
        result = self.resolve('codex', {'CODEX_THREAD_ID': 'cx', 'CLAUDE_CODE_SESSION_ID': 'cl'})
        self.assertEqual(result['session_ref'], 'codex:cx')
        self.assertEqual(result['root'], str(Path.home() / '.codex' / 'task-handoff'))

    def test_codex_home_and_shared_root_precedence(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            env = {'CODEX_HOME': str(base / 'profile'), 'TASK_HANDOFF_ROOT': str(base / 'shared')}
            self.assertEqual(self.resolve('codex', env)['root'], str(base / 'shared'))
            self.assertEqual(self.resolve('codex', env, str(base / 'explicit'))['root'], str(base / 'explicit'))
            del env['TASK_HANDOFF_ROOT']
            self.assertEqual(self.resolve('codex', env)['root'], str(base / 'profile' / 'task-handoff'))

    def test_claude_compatibility(self):
        result = self.resolve('claude', {'CLAUDE_CODE_SESSION_ID': 'cl', 'CODEX_THREAD_ID': 'cx'})
        self.assertEqual(result['session_ref'], 'claude:cl')
        self.assertEqual(result['root'], str(Path.home() / '.claude' / 'task-handoff'))

    def test_claude_rendered_session_is_used_without_environment(self):
        self.assertEqual(self.resolve('claude', session_id='rendered-id')['session_ref'], 'claude:rendered-id')

    def test_unexpanded_session_is_rejected(self):
        with self.assertRaises(ValueError):
            self.resolve('claude', session_id='${CLAUDE_SESSION_ID}')

    def test_claude_skill_entries_pass_rendered_config_to_cli(self):
        import re
        plugin = Path(__file__).resolve().parent.parent
        script = plugin / 'scripts' / 'handoff_runtime.py'
        with tempfile.TemporaryDirectory(prefix='原交接目录 ') as folder:
            target = str(Path(folder) / 'custom-tasks')
            for skill in ('task-save', 'task-resume', 'task-manage'):
                text = (plugin / 'skills' / skill / 'SKILL.md').read_text(encoding='utf-8')
                # Simulate Claude's documented SKILL.md rendering boundary, not reference-file reads.
                rendered = text.replace('${user_config.handoff_root}', target).replace('${CLAUDE_SESSION_ID}', 'rendered-session')
                root = re.search(r'Claude 数据根：`([^`]+)`', rendered).group(1)
                session = re.search(r'Claude 会话 ID：`([^`]+)`', rendered).group(1)
                result = subprocess.run([sys.executable, '-I', str(script), '--host', 'claude',
                                         '--root', root, '--session-id', session],
                                        capture_output=True, encoding='utf-8', check=True)
                context = json.loads(result.stdout)
                self.assertEqual(context['root'], target)
                self.assertEqual(context['session_ref'], 'claude:rendered-session')
            self.assertFalse(Path(target).exists())

    def test_missing_session_is_explicit(self):
        self.assertEqual(self.resolve('codex')['session_ref'], 'codex:unknown')
        self.assertIsNone(self.resolve('codex')['session_id'])

    def test_new_session_records_remain_compatible_with_v2_checks(self):
        from test_handoff_check import V2, hc, run, w
        with tempfile.TemporaryDirectory() as folder:
            old, new, log = [str(Path(folder) / name) for name in ('old.md', 'handoff.md', 'log.md')]
            w(old, V2)
            for host in ('codex', 'claude'):
                session_ref = self.resolve(host)['session_ref']
                w(new, V2.replace('session s1', 'session ' + session_ref + '; session s1'))
                w(log, '# 历史\n')
                for fn, args in ((hc.sections, (new,)), (hc.zero_loss, (old, new, log))):
                    code, output = run(fn, *args)
                    self.assertEqual(code, 0, output)

    def test_rejects_unexpanded_templates_and_relative_roots(self):
        for root in ('${user_config.handoff_root}', 'relative/tasks'):
            with self.assertRaises(ValueError):
                self.resolve('codex', root=root)

    def test_cli_is_read_only_and_paths_work_outside_plugin(self):
        script = Path(__file__).with_name('handoff_runtime.py')
        with tempfile.TemporaryDirectory(prefix='handoff 空格 ') as folder:
            target = Path(folder) / 'not-created'
            result = subprocess.run([sys.executable, '-I', str(script), '--host', 'codex', '--root', str(target)],
                                    cwd=folder, capture_output=True, encoding='utf-8', check=True)
            context = json.loads(result.stdout)
            self.assertFalse(target.exists())
            self.assertTrue(Path(context['check_script']).is_file())
            self.assertEqual(context['index'], str(target / 'INDEX.md'))


if __name__ == '__main__':
    unittest.main()
