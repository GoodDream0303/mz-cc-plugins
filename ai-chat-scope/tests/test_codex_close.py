import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SRC = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(SRC))

SID = '11111111-1111-4111-8111-111111111111'


class Process:
    def __init__(self, system):
        self.system = system

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def identity(self):
        return {'pid': 123, 'started': self.system.started,
                'image': self.system.image, 'argv': self.system.argv}

    def terminate(self):
        self.system.terminated = True
        if self.system.release_on_exit:
            self.system.locked = False

    def wait(self):
        return self.system.exits


class System:
    def __init__(self):
        self.pids = [123]
        self.started = 456
        self.image = r'C:\tools\codex.exe'
        self.argv = ['codex.exe']
        self.locked = True
        self.terminated = False
        self.exits = True
        self.release_on_exit = True
        self.on_open = None

    def owners(self, path):
        return self.pids

    def held(self, path):
        return self.locked

    def open(self, pid, terminate=False):
        if self.on_open:
            self.on_open(self)
        return Process(self)


class CodexCloseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='scope-close-test-')
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        (self.home / 'thread-writer-locks').mkdir()
        self.path = self.home / 'thread-writer-locks' / (SID + '.lock')
        self.path.write_bytes(b'fixture')
        self.system = System()

    def test_inspect_returns_only_exact_identity_without_termination(self):
        from codex_close import inspect_session
        self.assertEqual(inspect_session(self.home, SID, self.system), {'pid': 123, 'started': 456})
        self.assertFalse(self.system.terminated)
        self.assertEqual(self.path.read_bytes(), b'fixture')

    def test_close_requires_same_incarnation_and_releases_the_lock(self):
        from codex_close import close_session
        self.assertEqual(close_session(self.home, SID, {'pid':123, 'started':456}, self.system),
                         {'pid':123, 'started':456})
        self.assertTrue(self.system.terminated)

    def test_ambiguous_or_changed_owners_never_terminate(self):
        from codex_close import close_session
        for pids in ([], [123, 999], [999]):
            with self.subTest(pids=pids):
                self.system.pids = pids
                with self.assertRaises(ValueError):
                    close_session(self.home, SID, {'pid':123, 'started':456}, self.system)
                self.assertFalse(self.system.terminated)

    def test_reused_pid_never_terminates(self):
        from codex_close import close_session
        self.system.started = 457
        with self.assertRaises(ValueError):
            close_session(self.home, SID, {'pid':123, 'started':456}, self.system)
        self.assertFalse(self.system.terminated)

    def test_non_cli_modes_and_other_images_are_rejected(self):
        from codex_close import inspect_session
        for argv in (['codex.exe','app-server'], ['codex.exe','exec'],
                     ['codex.exe','remote-control'], ['codex.exe','mcp-server'],
                     ['codex.exe','--code-mode-host','ipc://fixture']):
            with self.subTest(argv=argv):
                self.system.argv = argv
                with self.assertRaises(ValueError):
                    inspect_session(self.home, SID, self.system)
        self.system.argv = ['other.exe']
        self.system.image = r'C:\tools\other.exe'
        with self.assertRaises(ValueError):
            inspect_session(self.home, SID, self.system)
        self.assertFalse(self.system.terminated)

    def test_noninteractive_and_unknown_commands_or_flags_are_rejected(self):
        from codex_close import inspect_session
        for args in (['review','--uncommitted'], ['exec-server'], ['future-server'],
                     ['--future-server'], ['--model=fixture','app-server'],
                     ['--config','mode=fixture','review']):
            with self.subTest(args=args):
                self.system.argv = ['codex.exe'] + args
                with self.assertRaises(ValueError):
                    inspect_session(self.home, SID, self.system)
                self.assertFalse(self.system.terminated)

    def test_known_interactive_options_and_explicit_prompts_are_allowed(self):
        from codex_close import inspect_session
        for args in ([], ['--no-daemon'], ['resume', SID], ['fork','--last'],
                     ['--model','app-server'], ['--config','label=review'],
                     ['--','app-server'], ['resume', SID, '--', 'exec-server'],
                     ['--cd=C:/fixture','--no-alt-screen'], ['-mfixture','resume',SID]):
            with self.subTest(args=args):
                self.system.argv = ['codex.exe'] + args
                self.assertEqual(inspect_session(self.home, SID, self.system),
                                 {'pid':123,'started':456})

    def test_owner_changes_after_opening_cancel_before_termination(self):
        from codex_close import close_session
        self.system.on_open = lambda system: setattr(system, 'pids', [999])
        with self.assertRaises(ValueError):
            close_session(self.home, SID, {'pid':123, 'started':456}, self.system)
        self.assertFalse(self.system.terminated)

    def test_missing_lock_or_invalid_session_never_opens_process(self):
        from codex_close import inspect_session
        self.path.unlink()
        with self.assertRaises(ValueError):
            inspect_session(self.home, SID, self.system)
        with self.assertRaises(ValueError):
            inspect_session(self.home, '../escape', self.system)
        self.assertFalse(self.system.terminated)

    def test_released_lock_cancels_before_termination(self):
        from codex_close import close_session
        self.system.locked = False
        with self.assertRaises(ValueError):
            close_session(self.home, SID, {'pid':123, 'started':456}, self.system)
        self.assertFalse(self.system.terminated)

    def test_process_access_denied_never_terminates(self):
        from codex_close import close_session
        with patch.object(self.system, 'open', side_effect=PermissionError('fixture denied')):
            with self.assertRaises(OSError):
                close_session(self.home, SID, {'pid':123, 'started':456}, self.system)
        self.assertFalse(self.system.terminated)

    @unittest.skipUnless(sys.platform == 'win32', 'Windows junction fixture')
    def test_lock_directory_junction_is_rejected_without_process_access(self):
        from codex_close import inspect_session
        outside = tempfile.TemporaryDirectory(prefix='scope-close-outside-')
        try:
            (Path(outside.name) / self.path.name).write_bytes(b'outside fixture')
            self.path.unlink()
            self.path.parent.rmdir()
            command = ("New-Item -ItemType Junction -Path '" + str(self.path.parent).replace("'", "''")
                       + "' -Target '" + outside.name.replace("'", "''") + "' | Out-Null")
            result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',command],
                                    capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0)
            with patch.object(self.system, 'open') as opened:
                with self.assertRaises(ValueError):
                    inspect_session(self.home, SID, self.system)
                opened.assert_not_called()
            self.assertEqual((Path(outside.name) / self.path.name).read_bytes(), b'outside fixture')
        finally:
            if self.path.parent.exists():
                os.rmdir(self.path.parent)
            outside.cleanup()

    def test_unverified_exit_or_retained_lock_is_an_error(self):
        from codex_close import close_session
        for exits, release in ((False, True), (True, False)):
            with self.subTest(exits=exits, release=release):
                self.system = System()
                self.system.exits, self.system.release_on_exit = exits, release
                with self.assertRaises(OSError):
                    close_session(self.home, SID, {'pid':123, 'started':456}, self.system)

    @unittest.skipUnless(sys.platform == 'win32', 'Windows process and file lock primitives')
    def test_real_owned_child_identity_exit_and_lock_release(self):
        from codex_close import WindowsSessionControl, inspect_session
        program = ("import msvcrt,sys; f=open(sys.argv[1],'r+b'); "
                   "msvcrt.locking(f.fileno(),msvcrt.LK_LOCK,1); "
                   "print('ready',flush=True); sys.stdin.readline()")
        child = subprocess.Popen([sys.executable, '-I', '-B', '-u', '-c', program, str(self.path)],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'ready')
            system = WindowsSessionControl()
            self.assertEqual(system.owners(self.path), [child.pid])
            self.assertTrue(system.held(self.path))
            # The real control boundary must reject a non-Codex owner.
            with self.assertRaises(ValueError):
                inspect_session(self.home, SID)
            self.assertIsNone(child.poll())
            with system.open(child.pid, terminate=True) as process:
                info = process.identity()
                self.assertEqual(info['pid'], child.pid)
                self.assertGreater(info['started'], 0)
                self.assertEqual(Path(info['image']).name.lower(), Path(sys.executable).name.lower())
                self.assertIn('-c', info['argv'])
                process.terminate()
                self.assertTrue(process.wait())
            child.wait(timeout=5)
            self.assertFalse(system.held(self.path))
            self.assertEqual(self.path.read_bytes(), b'fixture')
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            child.stdin.close()
            child.stdout.close()


if __name__ == '__main__':
    unittest.main()
