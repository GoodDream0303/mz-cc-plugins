import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from runtime_paths import home_events_root,publish_event,consume_events

SID='11111111-1111-4111-8111-111111111111'


@unittest.skipUnless(sys.platform=='win32','Owned Windows junction fixture')
class RuntimeBoundaryTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory(prefix='scope-runtime-boundary-')
        self.addCleanup(temporary.cleanup)
        self.base=Path(temporary.name);self.app=self.base/'app';self.app.mkdir()
        self.outside=self.base/'outside';self.outside.mkdir()
        self.link=self.app/'runtime'
        command="New-Item -ItemType Junction -Path '"+str(self.link).replace("'","''")+"' -Target '"+str(self.outside).replace("'","''")+"' | Out-Null"
        result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',command],capture_output=True,timeout=15)
        self.assertEqual(result.returncode,0)
        self.addCleanup(lambda:os.rmdir(self.link) if self.link.exists() else None)

    def test_publish_refuses_ancestor_junction_outside_original_runtime(self):
        with self.assertRaises((ValueError,OSError)):
            publish_event(home_events_root(self.app,self.base/'home'),{'session_id':SID,'hook_event_name':'Stop'})
        self.assertEqual(list(self.outside.iterdir()),[])

    def test_consume_refuses_outside_file_and_does_not_delete_it(self):
        requested=home_events_root(self.app,self.base/'home')
        folder=requested/SID;folder.mkdir(parents=True)
        path=folder/('00000000000000000001-'+'a'*32+'.json')
        path.write_text(json.dumps({'session_id':SID,'hook_event_name':'Stop','observed_ns':1}))
        with self.assertRaises((ValueError,OSError)):
            consume_events(requested,SID)
        self.assertTrue(path.exists())


if __name__=='__main__':unittest.main()
