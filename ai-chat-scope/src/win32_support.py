"""File/window primitives only; no enumeration or opening of other processes."""
import ctypes
from ctypes import wintypes
import sys
import hashlib
import os
from pathlib import Path
from functools import lru_cache


@lru_cache(maxsize=1)
def _window_api():
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
    user32.GetAncestor.restype = wintypes.HWND
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetWindowLongW.restype = ctypes.c_long
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [callback, wintypes.LPARAM]
    user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                                   ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
    return user32


def ensure_topmost(hwnd):
    """Repair own mapped window only when topmost state/order has been lost."""
    if sys.platform != 'win32':
        return False
    user32 = _window_api()
    hwnd = user32.GetAncestor(hwnd, 2)  # GA_ROOT: Tk's native wrapper, not its child.
    if not hwnd or not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
        return False
    needs_repair = not (user32.GetWindowLongW(hwnd, -20) & 8)  # WS_EX_TOPMOST
    if not needs_repair:
        rect = wintypes.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            raise ctypes.WinError(ctypes.get_last_error())
        if rect.right <= rect.left or rect.bottom <= rect.top:
            return False
        stopped = False

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def check_above(other, _):
            nonlocal needs_repair, stopped
            if other == hwnd:
                stopped = True
                return False
            if (not user32.IsWindowVisible(other) or user32.IsIconic(other)
                    or user32.GetWindowLongW(other, -20) & 8):
                return True
            other_rect = wintypes.RECT()
            if (user32.GetWindowRect(other, ctypes.byref(other_rect))
                    and other_rect.right > other_rect.left and other_rect.bottom > other_rect.top
                    and other_rect.left < rect.right and other_rect.right > rect.left
                    and other_rect.top < rect.bottom and other_rect.bottom > rect.top):
                needs_repair = stopped = True
                return False
            return True

        ctypes.set_last_error(0)
        if not user32.EnumWindows(check_above, 0) and not stopped:
            raise ctypes.WinError(ctypes.get_last_error())
    if needs_repair:
        # HWND_TOPMOST; keep focus, position and size. Do not repeatedly raise a
        # healthy window above other topmost apps, menus or dialogs.
        if not user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0013):
            raise ctypes.WinError(ctypes.get_last_error())
    return needs_repair


def probe_writer_lock(path):
    """Observe an existing byte lock by READ, without acquiring or changing it."""
    if sys.platform != "win32":
        return "unavailable"
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                  ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                               ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
    kernel.ReadFile.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateFileW(str(path), 0x80000000, 7, None, 3, 0, None)
    if handle == ctypes.c_void_p(-1).value:
        return "released" if ctypes.get_last_error() in (2, 3) else "unavailable"
    try:
        buffer = ctypes.create_string_buffer(1)
        read = wintypes.DWORD()
        if kernel.ReadFile(handle, buffer, 1, ctypes.byref(read), None):
            return "released"
        return "held" if ctypes.get_last_error() == 33 else "unavailable"
    finally:
        kernel.CloseHandle(handle)


class _InstanceGuard:
    def __init__(self, kernel, handle):
        self.kernel, self.handle = kernel, handle

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def claim_single_instance(root=None):
    from runtime_paths import runtime_root
    root = Path(root) if root is not None else runtime_root()
    identity = os.path.normcase(str(root.resolve()) + "|" + str(Path.home()))
    name = "Local\\AIChatScope-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateMutexW(None, False, name)
    error = ctypes.get_last_error()
    if not handle:
        raise OSError("Could not create application instance guard")
    if error == 183:
        kernel.CloseHandle(handle)
        return None
    return _InstanceGuard(kernel, handle)
