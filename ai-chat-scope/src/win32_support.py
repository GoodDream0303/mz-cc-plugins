"""File/window primitives only; no enumeration or opening of other processes."""
import ctypes
from ctypes import wintypes
import sys
import hashlib
import os
from pathlib import Path


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
