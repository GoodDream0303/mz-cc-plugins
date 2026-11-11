"""Real Windows/Tk fixtures; never reorder, activate or close user windows."""
import ctypes
from ctypes import wintypes
from contextlib import contextmanager
import importlib.machinery
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SRC = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(SRC))
import win32_support


@unittest.skipUnless(sys.platform == 'win32', 'Windows window ordering')
class TopmostRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import tkinter
        cls.tk = tkinter
        loader = importlib.machinery.SourceFileLoader('scope_topmost_test', str(SRC / 'scope.pyw'))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        cls.module = importlib.util.module_from_spec(spec)
        loader.exec_module(cls.module)
        cls.u = ctypes.WinDLL('user32', use_last_error=True)
        cls.u.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
        cls.u.GetAncestor.restype = wintypes.HWND
        cls.u.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        cls.u.GetWindowLongW.restype = ctypes.c_long
        cls.u.GetForegroundWindow.restype = wintypes.HWND
        cls.u.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        cls.u.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                                      ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
        cls.u.SetWindowPos.restype = wintypes.BOOL
        cls.u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        cls.u.IsWindowVisible.argtypes = [wintypes.HWND]
        cls.u.IsIconic.argtypes = [wintypes.HWND]
        cls.enum_callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        cls.u.EnumWindows.argtypes = [cls.enum_callback, wintypes.LPARAM]

    def setUp(self):
        self.root = self.tk.Tk()
        self.addCleanup(self.close_fixture)
        self.root.withdraw()
        self.scope = self.module.Scope(
            self.root, SimpleNamespace(sources=[], latest=lambda: None), None,
            config={'pinned': False, 'x': 40, 'y': 400, 'width': 220})
        self.root.deiconify()
        self.cover = self.tk.Toplevel(self.root)
        self.cover.title('Scope topmost test fixture')
        self.cover.geometry('220x120+40+400')
        self.root.update()
        self.hwnd = self.u.GetAncestor(self.root.winfo_id(), 2)
        self.cover_hwnd = self.u.GetAncestor(self.cover.winfo_id(), 2)

    def close_fixture(self):
        for timer in self.root.tk.call('after', 'info'):
            self.root.after_cancel(timer)
        self.root.destroy()

    def position(self, hwnd, after):
        self.assertTrue(self.u.SetWindowPos(hwnd, after, 0, 0, 0, 0, 0x0013))

    def topmost(self, hwnd):
        return bool(self.u.GetWindowLongW(hwnd, -20) & 8)

    def rectangle(self, hwnd):
        rect = wintypes.RECT()
        self.assertTrue(self.u.GetWindowRect(hwnd, ctypes.byref(rect)))
        return rect.left, rect.top, rect.right, rect.bottom

    def above(self, first, second):
        order = []
        @self.enum_callback
        def collect(hwnd, _):
            if hwnd in (first, second):
                order.append(hwnd)
            return len(order) < 2
        self.u.EnumWindows(collect, 0)
        self.assertEqual(set(order), {first, second})
        return order[0] == first

    def arrange_normal_cover(self):
        self.position(self.hwnd, -2)  # HWND_NOTOPMOST
        self.position(self.hwnd, 0)   # highest normal window
        self.position(self.cover_hwnd, 0)
        self.assertTrue(self.above(self.cover_hwnd, self.hwnd))

    @contextmanager
    def native_flag_still_topmost(self):
        # Windows ignores SetWindowLongW changes to WS_EX_TOPMOST. Override only
        # that read; enumeration, overlap and window restoration remain native.
        fixture = self
        class Api:
            def __getattr__(self, name):
                return getattr(fixture.u, name)

            def GetWindowLongW(self, hwnd, index):
                style = fixture.u.GetWindowLongW(hwnd, index)
                return style | 8 if hwnd == fixture.hwnd and index == -20 else style
        with patch.object(win32_support, '_window_api', return_value=Api(), create=True):
            yield

    def test_poll_recovers_lost_topmost_without_focus_or_geometry_change(self):
        self.arrange_normal_cover()
        self.scope.pinned = True
        foreground = self.u.GetForegroundWindow()
        geometry = self.rectangle(self.hwnd)
        self.scope.poll()
        self.assertTrue(self.topmost(self.hwnd))
        self.assertTrue(self.above(self.hwnd, self.cover_hwnd))
        self.assertEqual(self.u.GetForegroundWindow(), foreground)
        self.assertEqual(self.rectangle(self.hwnd), geometry)

    def test_poll_recovers_order_when_native_topmost_flag_is_still_set(self):
        self.arrange_normal_cover()
        self.scope.pinned = True
        foreground = self.u.GetForegroundWindow()
        geometry = self.rectangle(self.hwnd)
        with self.native_flag_still_topmost():
            self.scope.poll()
        self.assertTrue(self.above(self.hwnd, self.cover_hwnd))
        self.assertTrue(self.topmost(self.hwnd))
        self.assertEqual(self.u.GetForegroundWindow(), foreground)
        self.assertEqual(self.rectangle(self.hwnd), geometry)

    def test_healthy_scope_does_not_overtake_another_topmost_window(self):
        self.position(self.hwnd, -1)
        self.position(self.cover_hwnd, -1)
        self.scope.pinned = True
        self.assertTrue(self.above(self.cover_hwnd, self.hwnd))
        self.scope.poll()
        self.assertTrue(self.above(self.cover_hwnd, self.hwnd))

    def test_unpinned_scope_stays_behind_normal_window(self):
        self.arrange_normal_cover()
        self.scope.poll()
        self.assertFalse(self.topmost(self.hwnd))
        self.assertTrue(self.above(self.cover_hwnd, self.hwnd))

    def test_nonoverlapping_normal_window_does_not_trigger_reordering(self):
        self.cover.geometry('220x120+500+400')
        self.root.update()
        self.arrange_normal_cover()
        self.scope.pinned = True
        with self.native_flag_still_topmost():
            self.scope.poll()
        self.assertTrue(self.above(self.cover_hwnd, self.hwnd))

    def test_zero_area_cover_does_not_trigger_reordering(self):
        self.cover.overrideredirect(True)
        self.root.update()
        self.cover_hwnd = self.u.GetAncestor(self.cover.winfo_id(), 2)
        for width, height in ((0, 10), (10, 0)):
            with self.subTest(width=width, height=height):
                self.assertTrue(self.u.SetWindowPos(
                    self.cover_hwnd, 0, 50, 410, width, height, 0x0010))
                self.arrange_normal_cover()
                self.scope.pinned = True
                with self.native_flag_still_topmost():
                    self.scope.poll()
                self.assertFalse(self.topmost(self.hwnd))

    def test_zero_area_scope_does_not_trigger_reordering(self):
        self.arrange_normal_cover()
        self.assertTrue(self.u.SetWindowPos(self.hwnd, 0, 50, 410, 0, 0, 0x0010))
        self.position(self.cover_hwnd, 0)
        self.scope.pinned = True
        with self.native_flag_still_topmost():
            self.scope.poll()
        self.assertFalse(self.topmost(self.hwnd))

    def test_hidden_or_minimized_cover_does_not_trigger_reordering(self):
        for state in (0, 6):
            with self.subTest(state=state):
                self.u.ShowWindow(self.cover_hwnd, 4)
                self.arrange_normal_cover()
                self.u.ShowWindow(self.cover_hwnd, state)
                self.scope.pinned = True
                with self.native_flag_still_topmost():
                    self.scope.poll()
                self.assertFalse(self.topmost(self.hwnd))

    def test_native_failure_keeps_poll_scheduled_and_next_poll_retries(self):
        self.arrange_normal_cover()
        self.scope.pinned = True
        fixture = self
        class Api:
            def __getattr__(self, name):
                return getattr(fixture.u, name)

            def SetWindowPos(self, *args):
                ctypes.set_last_error(5)
                return False
        scheduled = set(self.root.tk.call('after', 'info'))
        with patch.object(win32_support, '_window_api', return_value=Api(), create=True), \
             patch.object(self.module, 'log_error') as errors:
            self.scope.poll()
            errors.assert_called_once_with('poll')
        self.assertTrue(set(self.root.tk.call('after', 'info')) - scheduled)
        self.assertFalse(self.topmost(self.hwnd))
        self.scope.poll()
        self.assertTrue(self.topmost(self.hwnd))

    def test_hidden_or_minimized_scope_is_not_reordered_or_restored(self):
        for state in (0, 6):  # SW_HIDE, SW_MINIMIZE
            with self.subTest(state=state):
                self.u.ShowWindow(self.hwnd, 4)  # SW_SHOWNOACTIVATE
                self.arrange_normal_cover()
                self.u.ShowWindow(self.hwnd, state)
                self.scope.pinned = True
                self.scope.poll()
                self.assertFalse(self.topmost(self.hwnd))
                if state == 0:
                    self.assertFalse(self.u.IsWindowVisible(self.hwnd))
                else:
                    self.assertTrue(self.u.IsIconic(self.hwnd))


if __name__ == '__main__':
    unittest.main()
