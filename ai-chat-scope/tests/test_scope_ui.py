import importlib.machinery
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import shutil
import subprocess
import json
import queue
from types import SimpleNamespace
from unittest.mock import patch

SRC=Path(__file__).resolve().parents[1]/'src'
sys.path.insert(0,str(SRC))


class UiBoundaryTests(unittest.TestCase):
    def scope_module(self):
        loader=importlib.machinery.SourceFileLoader('scope_ui_test',str(SRC/'scope.pyw'))
        spec=importlib.util.spec_from_loader(loader.name,loader)
        module=importlib.util.module_from_spec(spec);loader.exec_module(module)
        return module

    def test_codex_cannot_invoke_close_even_when_row_claims_capability(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope)
        scope.root=object();scope._kill_done=[]
        row={'provider':'codex','id':'one','pid':123,'label':'test','capabilities':('close',)}
        with patch.object(module.messagebox,'askyesno',return_value=False) as ask:
            scope.kill_session(1,row)
            ask.assert_not_called()
        with patch.object(module.subprocess,'run') as run:
            scope._run_kill(row,'kill')
            run.assert_not_called()

    def test_codex_context_menu_closes_or_copies_and_switches_to_claude_close(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope)
        class Menu:
            def __init__(self):self.entries=[{'label':'pin'},{'label':'restart'}]
            def insert_command(self,index,**entry):self.entries.insert(index,entry)
            def insert_separator(self,index):self.entries.insert(index,{'label':'separator'})
            def delete(self,start,end):del self.entries[start:end+1]
            def entryconfigure(self,index,**fields):self.entries[index].update(fields)
            def tk_popup(self,*args):pass
            def grab_release(self):pass
        class Root:
            clipboard=''
            def clipboard_clear(self):self.clipboard=''
            def clipboard_append(self,value):self.clipboard+=value
        scope.root=Root();scope.menu=Menu();scope.pinned=True;scope._menu_count=0
        scope._get_row_at=lambda x,y:0
        scope.sessions=[{'provider':'codex','id':'codex-one','pid':None,'label':'Codex','capabilities':('copy_id',)}]
        event=SimpleNamespace(x=0,y=0,x_root=0,y_root=0)
        scope.show_menu(event)
        self.assertIn('关闭 Codex',scope.menu.entries[0]['label'])
        with patch.object(scope,'close_codex_session') as close:
            scope.menu.entries[0]['command']()
            close.assert_called_once_with(scope.sessions[0])
        self.assertIn('复制',scope.menu.entries[1]['label'])
        scope.menu.entries[1]['command']()
        self.assertEqual(scope.root.clipboard,'codex-one')
        scope.sessions=[{'provider':'claude','id':'claude-one','pid':123,'label':'Claude','capabilities':('close',)}]
        scope.show_menu(event)
        self.assertIn('关闭',scope.menu.entries[0]['label'])
        self.assertEqual(len(scope.menu.entries),4)

    def codex_action_scope(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope)
        scope.root=object();scope._codex_done=queue.Queue();scope._codex_pending={'one'}
        scope._sig=None
        scope.sessions=[{'provider':'codex','id':'one','label':'Fixture','capabilities':('copy_id',)}]
        return module,scope,scope.sessions[0]

    def test_codex_cancelled_confirmation_never_starts_close(self):
        module,scope,row=self.codex_action_scope()
        scope._codex_done.put((row,'inspect',{'ok':True,'identity':{'pid':123,'started':456}}))
        with patch.object(module.messagebox,'askyesno',return_value=False), \
             patch.object(scope,'_start_codex_action') as start:
            scope._handle_codex_actions()
            start.assert_not_called()
        self.assertEqual(scope._codex_pending,set())
        self.assertEqual(scope.sessions,[row])

    def test_codex_confirmed_close_forwards_the_inspected_incarnation(self):
        module,scope,row=self.codex_action_scope()
        scope._codex_done.put((row,'inspect',{'ok':True,'identity':{'pid':123,'started':456}}))
        with patch.object(module.messagebox,'askyesno',return_value=True), \
             patch.object(scope,'_start_codex_action') as start:
            scope._handle_codex_actions()
            start.assert_called_once_with(row,'close',{'pid':123,'started':456})

    def test_codex_failure_does_not_hide_the_session_or_offer_broad_kill(self):
        module,scope,row=self.codex_action_scope()
        scope._codex_done.put((row,'close',{'ok':False,'error':'identity changed'}))
        with patch.object(module.messagebox,'showerror') as error, \
             patch.object(module.messagebox,'askyesno') as ask:
            scope._handle_codex_actions()
            error.assert_called_once()
            ask.assert_not_called()
        self.assertEqual(scope.sessions,[row])
        self.assertEqual(scope._codex_pending,set())

    def test_repeated_codex_close_click_starts_only_one_inspection(self):
        module,scope,row=self.codex_action_scope()
        scope._codex_pending.clear()
        with patch.object(scope,'_start_codex_action') as start:
            scope.close_codex_session(row)
            scope.close_codex_session(row)
            start.assert_called_once_with(row,'inspect')

    def test_codex_helper_timeout_or_invalid_output_is_reported_as_failure(self):
        module,scope,row=self.codex_action_scope()
        scope.codex_home='C:/fixture'
        cases = [subprocess.TimeoutExpired('fixture',30),
                 SimpleNamespace(returncode=0,stdout='not-json')]
        for case in cases:
            with self.subTest(case=type(case).__name__):
                kwargs = {'side_effect':case} if isinstance(case,Exception) else {'return_value':case}
                with patch.object(module.subprocess,'run',**kwargs):
                    scope._run_codex_action(row,'inspect')
                session,action,data=scope._codex_done.get_nowait()
                self.assertEqual(session,row)
                self.assertFalse(data['ok'])

    @unittest.skipUnless(sys.platform=='win32','Windows named mutex')
    def test_single_instance_is_scoped_to_own_runtime_and_released(self):
        import win32_support
        self.assertTrue(hasattr(win32_support,'claim_single_instance'),'Single instance guard is not implemented')
        with tempfile.TemporaryDirectory(prefix='scope-instance-test-') as raw:
            root=Path(raw)
            first=win32_support.claim_single_instance(root)
            self.assertIsNotNone(first)
            try:
                self.assertIsNone(win32_support.claim_single_instance(root))
                other=win32_support.claim_single_instance(root/'other')
                self.assertIsNotNone(other);other.close()
            finally:first.close()
            again=win32_support.claim_single_instance(root)
            self.assertIsNotNone(again);again.close()

    def test_entry_import_does_not_write_into_installed_plugin_source(self):
        with tempfile.TemporaryDirectory(prefix='scope-import-test-') as raw:
            root=Path(raw)/'src'
            shutil.copytree(SRC,root,ignore=shutil.ignore_patterns('__pycache__'))
            code="import sys,runpy;sys.path.insert(0,sys.argv[1]);runpy.run_path(sys.argv[2])"
            result=subprocess.run([sys.executable,'-I','-c',code,str(root),str(root/'scope.pyw')],capture_output=True,timeout=15)
            self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace'))
            self.assertEqual(list(root.rglob('__pycache__')),[])

    def test_close_rechecks_registry_after_identity_changed_or_disappeared(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope)
        scope._kill_done=[]
        row={'provider':'claude','id':'old-session','pid':123,'label':'Old','capabilities':('close',)}
        with tempfile.TemporaryDirectory(prefix='scope-close-test-') as raw:
            scope.claude_source=SimpleNamespace(sessions_dir=raw)
            registry=Path(raw)/'123.json'
            for replacement in ({'pid':123,'sessionId':'new-session'},None,[]):
                if replacement is None:registry.unlink(missing_ok=True)
                else:registry.write_text(json.dumps(replacement))
                for mode in ('quit','kill','stop'):
                    with patch.object(module.subprocess,'run') as run:
                        scope._run_kill(row,mode)
                        run.assert_not_called()

    def test_matching_claude_identity_still_uses_filtered_kill_command(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope);scope._kill_done=[]
        row={'provider':'claude','id':'same-session','pid':123,'label':'Same','capabilities':('close',)}
        with tempfile.TemporaryDirectory(prefix='scope-close-test-') as raw:
            scope.claude_source=SimpleNamespace(sessions_dir=raw)
            (Path(raw)/'123.json').write_text(json.dumps({'pid':123,'sessionId':'same-session'}))
            with patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'PID 123','')) as run:
                scope._run_kill(row,'kill')
                self.assertEqual(run.call_args.args[0],['taskkill','/F','/PID','123','/FI','IMAGENAME eq claude.exe'])
            self.assertTrue(scope._kill_done[-1][3])

    def test_long_name_truncation_has_bounded_font_measurements(self):
        module=self.scope_module();scope=module.Scope.__new__(module.Scope)
        class Font:
            calls=0
            def measure(self,text):self.calls+=1;return len(text)
        scope.f_name=Font()
        label=scope.fit_text('x'*10000,20)
        self.assertLessEqual(len(label),20)
        self.assertLess(scope.f_name.calls,32)


if __name__=='__main__':unittest.main()
