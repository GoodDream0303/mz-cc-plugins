import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))


class ConfigTests(unittest.TestCase):
    def functions(self):
        import runtime_paths
        self.assertTrue(hasattr(runtime_paths,'load_window_config'), 'Config compatibility is not implemented')
        return runtime_paths.load_window_config, runtime_paths.save_window_config

    def test_legacy_is_read_only_and_new_config_has_precedence(self):
        load, save = self.functions()
        with tempfile.TemporaryDirectory(prefix='scope-config-test-') as raw:
            root = Path(raw);old = root/'old.json';new = root/'new.json'
            old.write_text('{"x":123,"opacity":0.5}',encoding='utf-8')
            before = old.read_bytes()
            self.assertEqual(load(new,old)['x'],123)
            self.assertFalse(new.exists())
            save(new,{'x':456})
            self.assertEqual(load(new,old)['x'],456)
            self.assertEqual(old.read_bytes(),before)
            self.assertFalse(new.read_bytes().startswith(bytes.fromhex('efbbbf')))

    def test_invalid_numbers_and_wrong_types_use_safe_geometry(self):
        load, _ = self.functions()
        with tempfile.TemporaryDirectory(prefix='scope-config-test-') as raw:
            p = Path(raw)/'new.json';p.write_text('{"x":NaN,"width":{},"scale":Infinity,"opacity":-9,"pinned":"false"}')
            data = load(p,Path(raw)/'missing')
            self.assertEqual(data['x'],80)
            self.assertEqual(data['width'],340)
            self.assertEqual(data['scale'],1)
            self.assertEqual(data['opacity'],.2)
            self.assertIs(data['pinned'],True)

    def test_window_save_preserves_explicit_live_endpoint_without_token_contents(self):
        _, save = self.functions()
        with tempfile.TemporaryDirectory(prefix='scope-config-test-') as raw:
            p=Path(raw)/'config.json'
            p.write_text(json.dumps({'codex':{'endpoint':'ws://127.0.0.1:4500','token_file':'C:/test/token'},'width':350}))
            save(p,{'x':120})
            data=json.loads(p.read_text())
            self.assertEqual(data['codex'],{'endpoint':'ws://127.0.0.1:4500','token_file':'C:/test/token'})
            self.assertEqual(data['x'],120)

    def test_credentials_in_invalid_endpoint_are_not_persisted(self):
        _, save = self.functions()
        with tempfile.TemporaryDirectory(prefix='scope-config-test-') as raw:
            p=Path(raw)/'config.json'
            save(p,{'codex':{'endpoint':'ws://user:SECRET@127.0.0.1:4500/?token=SECRET','token_file':'C:/token'}})
            self.assertNotIn('SECRET',p.read_text())
            self.assertNotIn('codex',json.loads(p.read_text()))


if __name__ == '__main__':unittest.main()
