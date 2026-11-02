from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(SRC))


class LockProbeTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'win32', 'Windows lock behavior')
    def test_probe_observes_own_fixture_lock_and_release_without_writing(self):
        self.assertTrue((SRC/'win32_support.py').exists(), 'Lock probe is not implemented')
        from win32_support import probe_writer_lock
        with tempfile.TemporaryDirectory(prefix='scope-lock-test-') as directory:
            path = Path(directory)/'fixture.lock'
            path.write_bytes(b'x')
            program = "import msvcrt,sys; f=open(sys.argv[1],'r+b'); msvcrt.locking(f.fileno(),msvcrt.LK_LOCK,1); print('ready',flush=True); sys.stdin.readline(); f.seek(0); msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1); f.close()"
            child = subprocess.Popen([sys.executable,'-u','-c',program,str(path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                self.assertEqual(child.stdout.readline().strip(), 'ready')
                self.assertEqual(probe_writer_lock(path), 'held')
                self.assertEqual([p.name for p in Path(directory).iterdir()], ['fixture.lock'])
                child.stdin.write('release\n');child.stdin.flush();child.wait(timeout=5)
                self.assertEqual(probe_writer_lock(path), 'released')
                self.assertEqual(path.read_bytes(), b'x')
            finally:
                if child.poll() is None:child.terminate();child.wait(timeout=5)
                child.stdin.close();child.stdout.close()


if __name__ == '__main__':
    unittest.main()
