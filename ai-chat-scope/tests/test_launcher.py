import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts/start_scope.py'


class LauncherTests(unittest.TestCase):
    def launcher(self):
        self.assertTrue(SCRIPT.exists(),'Launcher is not implemented')
        spec=importlib.util.spec_from_file_location('scope_launcher',SCRIPT)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    @unittest.skipUnless(sys.platform=='win32','Windows launcher')
    def test_quoted_unicode_path_is_passed_as_arguments_not_shell_code(self):
        launcher=self.launcher()
        with tempfile.TemporaryDirectory(prefix='scope-launch-test-') as raw:
            root=Path(raw)/"plugin ' 中文";src=root/'src';src.mkdir(parents=True)
            marker=root/'arguments.json'
            program="import sys,json;from pathlib import Path;Path("+repr(str(marker))+").write_text(json.dumps(sys.argv[1:]),encoding='utf-8')"
            (src/'scope.pyw').write_text(program,encoding='utf-8')
            argument="C:/data ' 中文/token $(literal)"
            with patch.dict(os.environ, {'AI_CHAT_SCOPE_RUNTIME': str(Path(raw)/'runtime')}):
                self.assertEqual(launcher.start_scope(root,['--codex-token-file',argument]),0)
            deadline=time.monotonic()+3
            while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(marker.exists())
            self.assertEqual(json.loads(marker.read_text()),['--codex-token-file',argument])

    def test_missing_entry_does_not_start_any_window(self):
        launcher=self.launcher()
        with tempfile.TemporaryDirectory(prefix='scope-launch-test-') as raw:
            self.assertNotEqual(launcher.start_scope(Path(raw)),0)

    @unittest.skipUnless(sys.platform=='win32','Windows launcher')
    def test_child_import_failure_has_a_real_diagnostic_log(self):
        launcher=self.launcher()
        with tempfile.TemporaryDirectory(prefix='scope-launch-failure-') as raw:
            root=Path(raw)/'plugin';(root/'src').mkdir(parents=True)
            (root/'src/scope.pyw').write_text("raise RuntimeError('fixture early import failure')\n")
            runtime=Path(raw)/'runtime'
            with patch.dict(os.environ, {'AI_CHAT_SCOPE_RUNTIME': str(runtime)}):
                self.assertNotEqual(launcher.start_scope(root),0)
            log=runtime/'startup.log'
            self.assertTrue(log.is_file(), 'Early Python failures were discarded')
            self.assertIn('fixture early import failure',log.read_text(encoding='utf-8'))


if __name__=='__main__':unittest.main()
