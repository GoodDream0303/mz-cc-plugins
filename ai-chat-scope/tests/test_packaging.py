import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

PLUGIN=Path(__file__).resolve().parents[1]
REPO=PLUGIN.parent


class PackagingTests(unittest.TestCase):
    def test_both_manifests_declare_same_identity_and_resources_exist(self):
        for host in ('.claude-plugin','.codex-plugin'):
            path=PLUGIN/host/'plugin.json'
            self.assertTrue(path.exists(),'Missing '+host+' manifest')
            data=json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual((data['name'],data['version']),('ai-chat-scope','2.0.0'))
            self.assertTrue((PLUGIN/'skills/scope-show/SKILL.md').is_file())

    def test_codex_hooks_are_explicit_and_not_auto_loaded_by_claude(self):
        path=PLUGIN/'.codex-plugin/plugin.json'
        self.assertTrue(path.exists(),'Missing Codex manifest')
        codex=json.loads(path.read_text(encoding='utf-8'))
        claude=json.loads((PLUGIN/'.claude-plugin/plugin.json').read_text(encoding='utf-8'))
        self.assertNotIn('hooks',claude)
        self.assertFalse((PLUGIN/'hooks/hooks.json').exists())
        self.assertTrue((PLUGIN/codex['hooks']).is_file())

    def test_marketplaces_preserve_existing_plugins_and_resolve_new_source(self):
        claude=json.loads((REPO/'.claude-plugin/marketplace.json').read_text(encoding='utf-8'))
        codex=json.loads((REPO/'.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
        cc={entry['name']:entry for entry in claude['plugins']}
        cx={entry['name']:entry for entry in codex['plugins']}
        self.assertIn('task-handoff',cc);self.assertIn('codex-hud',cx)
        self.assertIn('ai-chat-scope',cc);self.assertIn('ai-chat-scope',cx)
        self.assertEqual((REPO/cc['ai-chat-scope']['source']).resolve(),PLUGIN.resolve())
        self.assertEqual((REPO/cx['ai-chat-scope']['source']['path']).resolve(),PLUGIN.resolve())

    def run_bundled_hook(self, shell, root_variable='PLUGIN_ROOT'):
        config=PLUGIN/'hooks/codex-hooks.json'
        self.assertTrue(config.exists(),'Missing bundled hook config')
        with tempfile.TemporaryDirectory(prefix='scope-package-test-') as raw:
            root=Path(raw);plugin=root/"plugin ' 中文"
            shutil.copytree(PLUGIN/'src',plugin/'src',ignore=shutil.ignore_patterns('__pycache__'))
            data=json.loads(config.read_text(encoding='utf-8'))
            hook=data['hooks']['PermissionRequest'][0]['hooks'][0]
            environment=os.environ.copy()
            environment.pop('PLUGIN_ROOT',None);environment.pop('CLAUDE_PLUGIN_ROOT',None)
            environment.update({root_variable:str(plugin),'CODEX_HOME':str(root/'codex'),'AI_CHAT_SCOPE_RUNTIME':str(root/'runtime')})
            payload={'session_id':'11111111-1111-4111-8111-111111111111','hook_event_name':'PermissionRequest','tool_input':{'command':'SECRET'}}
            command = ('cmd.exe /d /s /c "'+hook['commandWindows']+'"' if shell=='cmd.exe'
                       else [shell,'-NoProfile','-NonInteractive','-Command',hook['commandWindows']])
            result=subprocess.run(command,input=json.dumps(payload).encode(),capture_output=True,env=environment,timeout=15)
            self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace'))
            self.assertEqual(json.loads(result.stdout),{})
            files=list((root/'runtime').rglob('*.json'))
            self.assertEqual(len(files),1)
            self.assertNotIn('SECRET',files[0].read_text(encoding='utf-8'))
            self.assertEqual(list(plugin.rglob('__pycache__')),[])

    @unittest.skipUnless(sys.platform=='win32','Windows bundled hook invocation')
    def test_bundled_hook_runs_from_unicode_plugin_path_without_retaining_input(self):
        self.run_bundled_hook('powershell.exe')

    @unittest.skipUnless(sys.platform=='win32','Windows native cmd hook invocation')
    def test_bundled_hook_runs_through_native_cmd_shell(self):
        self.run_bundled_hook('cmd.exe')

    @unittest.skipUnless(sys.platform=='win32','Windows PowerShell 7 hook invocation')
    def test_bundled_hook_runs_through_powershell_7(self):
        shell=shutil.which('pwsh.exe') or shutil.which('pwsh')
        if not shell:self.skipTest('PowerShell 7 is not installed')
        self.run_bundled_hook(shell)

    @unittest.skipUnless(sys.platform=='win32','Compatibility plugin root environment')
    def test_bundled_hook_accepts_compatibility_root_environment(self):
        self.run_bundled_hook('cmd.exe','CLAUDE_PLUGIN_ROOT')

    @unittest.skipUnless(sys.platform=='win32','Windows missing-root bootstrap')
    def test_bundled_hook_without_root_exits_quietly_without_running_cwd_code(self):
        data=json.loads((PLUGIN/'hooks/codex-hooks.json').read_text(encoding='utf-8'))
        hook=data['hooks']['Stop'][0]['hooks'][0]
        environment=os.environ.copy();environment.pop('PLUGIN_ROOT',None);environment.pop('CLAUDE_PLUGIN_ROOT',None)
        result=subprocess.run('cmd.exe /d /s /c "'+hook['commandWindows']+'"',input=b'{}',capture_output=True,env=environment,timeout=10)
        self.assertEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout),{})
        self.assertEqual(result.stderr,b'')


if __name__=='__main__':unittest.main()
