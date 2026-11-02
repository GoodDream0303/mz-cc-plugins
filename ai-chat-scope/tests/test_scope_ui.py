import importlib.machinery
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import shutil
import subprocess
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

    def test_codex_context_menu_copies_id_and_switches_to_claude_close(self):
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
        scope.root=Root();scope.menu=Menu();scope.pinned=True;scope._menu_kill=False
        scope._get_row_at=lambda x,y:0
        scope.sessions=[{'provider':'codex','id':'codex-one','pid':None,'label':'Codex','capabilities':('copy_id',)}]
        event=SimpleNamespace(x=0,y=0,x_root=0,y_root=0)
        scope.show_menu(event)
        self.assertIn('复制',scope.menu.entries[0]['label'])
        scope.menu.entries[0]['command']()
        self.assertEqual(scope.root.clipboard,'codex-one')
        scope.sessions=[{'provider':'claude','id':'claude-one','pid':123,'label':'Claude','capabilities':('close',)}]
        scope.show_menu(event)
        self.assertIn('关闭',scope.menu.entries[0]['label'])
        self.assertEqual(len(scope.menu.entries),4)

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


if __name__=='__main__':unittest.main()
