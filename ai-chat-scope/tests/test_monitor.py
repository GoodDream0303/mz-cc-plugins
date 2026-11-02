from dataclasses import replace
from pathlib import Path
import sys
import threading
import time
import unittest

SRC = Path(__file__).resolve().parents[1]/'src'
sys.path.insert(0, str(SRC))
from session_types import SessionSnapshot, to_gui_row


class FakeSource:
    provider = 'claude'
    diagnostics = ()
    def __init__(self):self.state = 'run';self.fail = False
    def poll(self):
        if self.fail:raise OSError('SECRET')
        return [SessionSnapshot('claude','one',state=self.state)]


class MonitorTests(unittest.TestCase):
    def module(self):
        self.assertTrue((SRC/'monitor.py').exists(), 'Background monitor is not implemented')
        import monitor
        return monitor

    def wait_snapshot(self, monitor, predicate):
        deadline = time.monotonic()+2
        while time.monotonic()<deadline:
            value = monitor.latest()
            if value is not None and predicate(value):return value
            time.sleep(.005)
        self.fail('Expected a fresh background snapshot')

    def test_slow_source_does_not_block_other_source_or_ui_reads(self):
        module = self.module()
        release, entered = threading.Event(), threading.Event()
        self.addCleanup(release.set)
        class Slow:
            provider = 'codex'
            diagnostics = ()
            def poll(self):entered.set();release.wait();return []
        monitor = module.Monitor([Slow(),FakeSource()], interval=.01)
        self.addCleanup(monitor.stop);monitor.start()
        self.assertTrue(entered.wait(1))
        self.wait_snapshot(monitor, lambda x: bool(x[0]))
        start = time.monotonic();monitor.latest()
        self.assertLess(time.monotonic()-start,.1)

    def test_failed_source_retains_stale_snapshot_without_private_error(self):
        module = self.module();source = FakeSource()
        monitor = module.Monitor([source], interval=.01)
        self.addCleanup(monitor.stop);monitor.start()
        self.wait_snapshot(monitor, lambda x: bool(x[0]))
        source.fail = True
        rows, diagnostics = self.wait_snapshot(monitor, lambda x: bool(x[0]) and x[0][0].freshness=='stale')
        self.assertTrue(diagnostics)
        self.assertNotIn('SECRET', repr(diagnostics))

    def test_queue_keeps_latest_state_and_does_not_replay_old_snapshots(self):
        module = self.module();source = FakeSource()
        monitor = module.Monitor([source], interval=.01)
        self.addCleanup(monitor.stop);monitor.start()
        self.wait_snapshot(monitor, lambda x: bool(x[0]))
        source.state = 'stby'
        self.wait_snapshot(monitor, lambda x: bool(x[0]) and x[0][0].state=='stby')
        value = monitor.latest()
        self.assertTrue(value is None or value[0][0].state=='stby')

    def test_redraw_signature_covers_names_capabilities_and_diagnostics(self):
        module = self.module()
        original = SessionSnapshot('codex','one',title='First')
        signature = module.row_signature([to_gui_row(original)], ())
        self.assertEqual(signature, module.row_signature([to_gui_row(original)], ()))
        for changed in (replace(original,title='Second'),replace(original,capabilities=('authorization',)),replace(original,freshness='stale')):
            self.assertNotEqual(signature, module.row_signature([to_gui_row(changed)], ()))
        self.assertNotEqual(signature, module.row_signature([to_gui_row(original)], ('source unavailable',)))


if __name__ == '__main__':unittest.main()
