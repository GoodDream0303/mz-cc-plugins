import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

PLUGIN=Path(__file__).resolve().parents[1]
REPO=PLUGIN.parent


class PackagingTests(unittest.TestCase):
    def test_both_manifests_declare_same_identity_and_resources_exist(self):
        for host in ('.claude-plugin','.codex-plugin'):
            path=PLUGIN/host/'plugin.json'
            self.assertTrue(path.exists(),'Missing '+host+' manifest')
            data=json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual((data['name'],data['version']),('ai-chat-scope','2.1.1'))
            self.assertTrue((PLUGIN/'skills/scope-show/SKILL.md').is_file())

    def test_codex_hooks_are_explicit_and_not_auto_loaded_by_claude(self):
        path=PLUGIN/'.codex-plugin/plugin.json'
        self.assertTrue(path.exists(),'Missing Codex manifest')
        codex=json.loads(path.read_text(encoding='utf-8'))
        claude=json.loads((PLUGIN/'.claude-plugin/plugin.json').read_text(encoding='utf-8'))
        self.assertNotIn('hooks',claude)
        self.assertFalse((PLUGIN/'hooks/hooks.json').exists())
        self.assertTrue((PLUGIN/codex['hooks']).is_file())

    def test_onboarding_points_to_a_packaged_setup_skill_and_bootstrap(self):
        codex=json.loads((PLUGIN/'.codex-plugin/plugin.json').read_text(encoding='utf-8'))
        onboarding=codex.get('extensions',{}).get('com.openai',{}).get('onboardingSkill')
        self.assertIsInstance(onboarding,str,'No packaged setup entry is registered')
        self.assertTrue((PLUGIN/onboarding).is_file())
        self.assertTrue((PLUGIN/'scripts/scope.ps1').is_file())

    def test_marketplaces_preserve_existing_plugins_and_resolve_new_source(self):
        claude=json.loads((REPO/'.claude-plugin/marketplace.json').read_text(encoding='utf-8'))
        codex=json.loads((REPO/'.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
        cc={entry['name']:entry for entry in claude['plugins']}
        cx={entry['name']:entry for entry in codex['plugins']}
        self.assertIn('task-handoff',cc);self.assertIn('codex-hud',cx)
        self.assertIn('ai-chat-scope',cc);self.assertIn('ai-chat-scope',cx)
        self.assertEqual((REPO/cc['ai-chat-scope']['source']).resolve(),PLUGIN.resolve())
        self.assertEqual((REPO/cx['ai-chat-scope']['source']['path']).resolve(),PLUGIN.resolve())

    def run_bundled_hook(self, shell, root_variable='PLUGIN_ROOT', py_only=False, python_only=False, python3_only=False, hook_timeout=15, hostile_cwd=False, hostile_executables=False):
        config=PLUGIN/'hooks/codex-hooks.json'
        self.assertTrue(config.exists(),'Missing bundled hook config')
        with tempfile.TemporaryDirectory(prefix='scope-package-test-') as raw:
            root=Path(raw);plugin=root/"plugin ' 中文"
            shutil.copytree(PLUGIN/'src',plugin/'src',ignore=shutil.ignore_patterns('__pycache__'))
            shutil.copytree(PLUGIN/'scripts',plugin/'scripts',ignore=shutil.ignore_patterns('__pycache__'))
            data=json.loads(config.read_text(encoding='utf-8'))
            hook=data['hooks']['PermissionRequest'][0]['hooks'][0]
            environment=os.environ.copy()
            environment.pop('PLUGIN_ROOT',None);environment.pop('CLAUDE_PLUGIN_ROOT',None)
            environment.update({root_variable:str(plugin),'CODEX_HOME':str(root/'codex'),'AI_CHAT_SCOPE_RUNTIME':str(root/'runtime')})
            marker=root/'cwd-imported.txt'
            if hostile_cwd:
                (root/'uuid.py').write_text('from pathlib import Path\nPath('+repr(str(marker))+').write_text("unexpected")\nraise RuntimeError("cwd module imported")\n',encoding='utf-8')
            executable_marker=root/'cwd-executable.txt'
            if hostile_executables:
                for name in ('py.cmd','python.cmd','python3.cmd'):
                    (root/name).write_text('@echo unexpected > "'+str(executable_marker)+'"\n@exit /b 1\n',encoding='utf-8')
            if py_only:
                py=shutil.which('py.exe')
                if not py:self.skipTest('Python Launcher is not installed')
                system=Path(os.environ['SystemRoot'])/'System32'
                environment['PATH']=os.pathsep.join((str(Path(py).parent),str(system),str(system/'WindowsPowerShell/v1.0')))
            if python_only:
                system=Path(os.environ['SystemRoot'])/'System32'
                environment['PATH']=os.pathsep.join((str(Path(sys.executable).parent),str(system),str(system/'WindowsPowerShell/v1.0')))
            if python3_only:
                binaries=root/'bin';binaries.mkdir()
                (binaries/'python3.cmd').write_text('@"'+sys.executable+'" %*\n',encoding='utf-8')
                system=Path(os.environ['SystemRoot'])/'System32'
                environment['PATH']=os.pathsep.join((str(binaries),str(system),str(system/'WindowsPowerShell/v1.0')))
            payload={'session_id':'11111111-1111-4111-8111-111111111111','hook_event_name':'PermissionRequest','tool_input':{'command':'SECRET'}}
            command = ('cmd.exe /d /s /c "'+hook['commandWindows']+'"' if shell=='cmd.exe'
                       else [shell,'-NoProfile','-NonInteractive','-Command',hook['commandWindows']])
            try:
                result=subprocess.run(command,input=json.dumps(payload).encode(),capture_output=True,env=environment,cwd=root,timeout=hook_timeout)
            except subprocess.TimeoutExpired:
                self.fail('Bundled hook exceeded its %ss execution budget' % hook_timeout)
            self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace'))
            self.assertEqual(json.loads(result.stdout),{})
            self.assertFalse(executable_marker.exists(),'The hook executed a Python launcher from the calling project')
            files=list((root/'runtime').rglob('*.json'))
            self.assertEqual(len(files),1)
            self.assertNotIn('SECRET',files[0].read_text(encoding='utf-8'))
            self.assertEqual(list(plugin.rglob('__pycache__')),[])
            self.assertFalse(marker.exists(),'The hook imported Python code from the calling project')

    @unittest.skipUnless(sys.platform=='win32','Windows bundled hook invocation')
    def test_bundled_hook_runs_from_unicode_plugin_path_without_retaining_input(self):
        self.run_bundled_hook('powershell.exe')

    @unittest.skipUnless(sys.platform=='win32','Windows native cmd hook invocation')
    def test_bundled_hook_runs_through_native_cmd_shell(self):
        self.run_bundled_hook('cmd.exe')

    @unittest.skipUnless(sys.platform=='win32','Python Launcher hook invocation')
    def test_bundled_hook_supports_only_py_in_path(self):
        self.run_bundled_hook('cmd.exe', py_only=True)

    @unittest.skipUnless(sys.platform=='win32','Python executable hook invocation')
    def test_bundled_hook_supports_python_without_py_launcher(self):
        self.run_bundled_hook('cmd.exe', python_only=True)

    @unittest.skipUnless(sys.platform=='win32','Python3 command hook invocation')
    def test_bundled_hook_supports_only_python3_command(self):
        self.run_bundled_hook('cmd.exe',python3_only=True)

    @unittest.skipUnless(sys.platform=='win32','Isolated Python hook imports')
    def test_hook_does_not_import_modules_from_calling_project(self):
        self.run_bundled_hook('powershell.exe',hostile_cwd=True)

    @unittest.skipUnless(sys.platform=='win32','PATH-only interpreter lookup')
    def test_hook_does_not_execute_launchers_from_calling_project(self):
        self.run_bundled_hook('powershell.exe',hostile_executables=True)

    @unittest.skipUnless(sys.platform=='win32','Concurrent Windows hook budget')
    def test_concurrent_powershell_hooks_finish_within_three_second_limit(self):
        with ThreadPoolExecutor(max_workers=4) as workers:
            checks=[workers.submit(self.run_bundled_hook,'powershell.exe',hook_timeout=3) for _ in range(4)]
            for check in checks:
                check.result()

    @unittest.skipUnless(sys.platform=='win32','Passive missing-Python hook')
    def test_hook_with_plugin_root_but_no_python_is_quiet(self):
        data=json.loads((PLUGIN/'hooks/codex-hooks.json').read_text(encoding='utf-8'))
        hook=data['hooks']['Stop'][0]['hooks'][0]
        with tempfile.TemporaryDirectory(prefix='scope-no-python-hook-') as raw:
            environment=os.environ.copy()
            environment.update({'PLUGIN_ROOT':str(PLUGIN),'AI_CHAT_SCOPE_RUNTIME':str(Path(raw)/'runtime'),
                                'PATH':str(Path(os.environ['SystemRoot'])/'System32')})
            result=subprocess.run('cmd.exe /d /s /c "'+hook['commandWindows']+'"',input=b'{}',capture_output=True,env=environment,timeout=3)
            self.assertEqual(result.returncode,0)
            self.assertEqual(json.loads(result.stdout),{})
            self.assertEqual(result.stderr,b'')
            self.assertFalse((Path(raw)/'runtime').exists())

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
