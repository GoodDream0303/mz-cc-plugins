import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PLUGIN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN / 'src'))


@unittest.skipUnless(sys.platform == 'win32', 'Windows setup')
class SetupTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='scope-setup-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.runtime = self.base / 'runtime'
        environment = patch.dict(os.environ, {
            'AI_CHAT_SCOPE_RUNTIME': str(self.runtime),
            'LOCALAPPDATA': str(self.base / 'local'),
            'CODEX_HOME': str(self.base / 'custom-codex'),
            'CLAUDE_CONFIG_DIR': str(self.base / 'custom-claude'),
        })
        environment.start()
        self.addCleanup(environment.stop)

    def module(self):
        self.assertTrue((PLUGIN / 'src/setup_environment.py').is_file(),
                        'First-run environment checks are missing')
        return importlib.import_module('setup_environment')

    def test_first_setup_creates_config_and_reports_custom_homes_without_creating_source_dirs(self):
        report = self.module().prepare_environment(PLUGIN, initialize=True)
        config = self.runtime / 'config.json'
        self.assertEqual(json.loads(config.read_text())['width'], 340)
        self.assertEqual(Path(report['claude_home']), self.base / 'custom-claude')
        self.assertEqual(Path(report['codex_home']), self.base / 'custom-codex')
        self.assertFalse((self.base / 'custom-claude').exists())
        self.assertFalse((self.base / 'custom-codex').exists())
        self.assertTrue(report['messages'])
        self.assertFalse(config.read_bytes().startswith(bytes.fromhex('efbbbf')))

    def test_repeated_setup_preserves_existing_config_exactly(self):
        module = self.module()
        self.runtime.mkdir()
        config = self.runtime / 'config.json'
        before = b'{"width":401,"x":123,"custom":"keep","codex":{"endpoint":"ws://127.0.0.1:4500","token_file":"C:/token"}}\n'
        config.write_bytes(before)
        module.prepare_environment(PLUGIN, initialize=True)
        module.prepare_environment(PLUGIN, initialize=True)
        self.assertEqual(config.read_bytes(), before)

    def test_check_does_not_create_config(self):
        self.module().prepare_environment(PLUGIN)
        self.assertFalse((self.runtime / 'config.json').exists())
        self.assertEqual(list(self.runtime.iterdir()), [])

    def test_new_config_migrates_legacy_window_fields_without_modifying_legacy(self):
        module = self.module()
        old = self.base / 'local/claude-scope/config.json'
        old.parent.mkdir(parents=True)
        before = b'{"x":123,"base_w":456,"codex":{"endpoint":"ws://127.0.0.1:4500","token_file":"C:/old"}}'
        old.write_bytes(before)
        module.prepare_environment(PLUGIN, initialize=True)
        result = json.loads((self.runtime / 'config.json').read_text())
        self.assertEqual((result['x'], result['width']), (123, 456))
        self.assertNotIn('codex', result)
        self.assertEqual(old.read_bytes(), before)

    def test_damaged_config_is_reported_without_overwrite(self):
        module = self.module()
        self.runtime.mkdir()
        config = self.runtime / 'config.json'
        for before in (b'{broken', b'[]', b'x' * 65537):
            with self.subTest(before=before[:10]):
                config.write_bytes(before)
                with self.assertRaisesRegex(module.SetupError, 'config.json'):
                    module.prepare_environment(PLUGIN, initialize=True)
                self.assertEqual(config.read_bytes(), before)

    def test_missing_tkinter_reports_dependency_before_writing_config(self):
        module = self.module()
        with patch.object(module.importlib, 'import_module', side_effect=ImportError('missing')):
            with self.assertRaisesRegex(module.SetupError, 'tkinter'):
                module.prepare_environment(PLUGIN, initialize=True)
        self.assertFalse((self.runtime / 'config.json').exists())

    def test_tk_initialization_failure_is_reported(self):
        module = self.module()
        import tkinter
        with patch.object(tkinter, 'Tk', side_effect=tkinter.TclError('missing init.tcl')):
            with self.assertRaisesRegex(module.SetupError, 'Tk'):
                module.prepare_environment(PLUGIN, initialize=True)

    def test_runtime_path_is_a_file_is_actionable(self):
        module = self.module()
        self.runtime.write_text('occupied')
        with self.assertRaisesRegex(module.SetupError, 'runtime'):
            module.prepare_environment(PLUGIN, initialize=True)
        self.assertEqual(self.runtime.read_text(), 'occupied')

    def test_old_python_is_rejected_before_initialization(self):
        module = self.module()
        with patch.object(module.sys, 'version_info', (3, 8, 10)):
            with self.assertRaisesRegex(module.SetupError, '3.9'):
                module.prepare_environment(PLUGIN, initialize=True)


class ClaudeHomeTests(unittest.TestCase):
    def test_custom_claude_home_is_used_by_monitor(self):
        from monitor import create_sources
        with tempfile.TemporaryDirectory(prefix='scope-custom-home-') as raw:
            home = Path(raw) / 'custom'
            (home / 'sessions').mkdir(parents=True)
            (home / 'sessions/42.json').write_text(json.dumps({
                'pid': 42, 'sessionId': 'fixture-session', 'status': 'idle', 'cwd': raw}))
            with patch.dict(os.environ, {'CLAUDE_CONFIG_DIR': str(home)}):
                sources = create_sources({})
                try:
                    self.assertEqual([row.session_id for row in sources[0].poll()], ['fixture-session'])
                finally:
                    sources[1].close()

    def test_explicit_home_takes_precedence_over_environment(self):
        from claude_source import ClaudeSource
        with patch.dict(os.environ, {'CLAUDE_CONFIG_DIR': 'wrong'}):
            source = ClaudeSource(Path('chosen'))
        self.assertEqual(source.home, Path('chosen'))


@unittest.skipUnless(sys.platform == 'win32', 'Windows bootstrap')
class BootstrapTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='scope-bootstrap-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.plugin = self.base / "market plugin ' 中文"
        for folder in ('src', 'scripts'):
            shutil.copytree(PLUGIN / folder, self.plugin / folder,
                            ignore=shutil.ignore_patterns('__pycache__'))
        self.environment = os.environ.copy()
        self.environment.update({'AI_CHAT_SCOPE_RUNTIME': str(self.base / 'runtime'),
                                 'LOCALAPPDATA': str(self.base / 'local'),
                                 'CLAUDE_CONFIG_DIR': str(self.base / 'claude'),
                                 'CODEX_HOME': str(self.base / 'codex'),
                                 'PYTHONDONTWRITEBYTECODE': '1'})
        self.shell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'

    def run_bootstrap(self, *arguments):
        script = self.plugin / 'scripts/scope.ps1'
        self.assertTrue(script.is_file(), 'Windows bootstrap is missing')
        return subprocess.run([str(self.shell), '-NoProfile', '-NonInteractive',
                               '-ExecutionPolicy', 'Bypass', '-File', str(script), *arguments],
                              env=self.environment, input=b'{}', capture_output=True, timeout=20)

    def test_setup_with_only_py_launcher_in_path_and_unicode_plugin_location(self):
        py = shutil.which('py.exe')
        if not py:
            self.skipTest('Python Launcher is not installed')
        self.environment['PATH'] = str(Path(py).parent) + os.pathsep + str(Path(os.environ['SystemRoot']) / 'System32')
        self.assertIsNone(shutil.which('python.exe', path=self.environment['PATH']))
        result = self.run_bootstrap('-Setup')
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        config = self.base / 'runtime/config.json'
        self.assertEqual(json.loads(config.read_text())['width'], 340)
        before = config.read_bytes()
        result = self.run_bootstrap('-Setup')
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        self.assertEqual(config.read_bytes(), before)
        self.assertEqual(list(self.plugin.rglob('__pycache__')), [])

    def test_missing_python_reports_prerequisites_without_creating_config(self):
        self.environment['PATH'] = str(Path(os.environ['SystemRoot']) / 'System32')
        result = self.run_bootstrap('-Setup')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'Python', result.stdout + result.stderr)
        self.assertIn(b'tkinter', result.stdout + result.stderr)
        self.assertFalse((self.base / 'runtime/config.json').exists())

    def test_hook_without_python_or_plugin_root_is_quiet(self):
        self.environment['PATH'] = str(Path(os.environ['SystemRoot']) / 'System32')
        self.environment.pop('PLUGIN_ROOT', None)
        self.environment.pop('CLAUDE_PLUGIN_ROOT', None)
        result = self.run_bootstrap('-Hook')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {})
        self.assertEqual(result.stderr, b'')

    def test_setup_without_tkinter_reports_actual_dependency(self):
        block = self.base / 'missing-tk'
        block.mkdir()
        (block / 'tkinter.py').write_text("raise ImportError('fixture missing Tk')\n")
        self.environment['PYTHONPATH'] = str(block)
        result = subprocess.run([sys.executable, '-B', str(self.plugin / 'scripts/start_scope.py'), '--setup'],
                                env=self.environment, capture_output=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'tkinter', result.stdout + result.stderr)
        self.assertFalse((self.base / 'runtime/config.json').exists())

    def test_check_mode_does_not_initialize_config(self):
        result = self.run_bootstrap('-Check')
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        self.assertFalse((self.base / 'runtime/config.json').exists())

    def test_setup_and_check_work_with_non_chinese_output_encoding(self):
        self.environment['PYTHONIOENCODING'] = 'cp1252:strict'
        for mode in ('--check', '--setup'):
            with self.subTest(mode=mode):
                result = subprocess.run([sys.executable, '-B', str(self.plugin / 'scripts/start_scope.py'), mode],
                                        env=self.environment, capture_output=True, timeout=10)
                self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
                self.assertIn(b'claude_home:', result.stdout)
                self.assertNotIn(b'UnicodeEncodeError', result.stderr)
        self.assertTrue((self.base / 'runtime/config.json').is_file())

    def test_dependency_error_survives_non_chinese_output_encoding(self):
        block = self.base / 'blocked-tk'
        block.mkdir()
        (block / 'tkinter.py').write_text("raise ImportError('fixture missing Tk')\n")
        self.environment.update({'PYTHONPATH': str(block), 'PYTHONIOENCODING': 'cp1252:strict'})
        result = subprocess.run([sys.executable, '-B', str(self.plugin / 'scripts/start_scope.py'), '--setup'],
                                env=self.environment, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b'tkinter', result.stderr)
        self.assertNotIn(b'UnicodeEncodeError', result.stderr)


if __name__ == '__main__':
    unittest.main()
