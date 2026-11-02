"""File/window primitives only; no enumeration or opening of other processes."""
import ctypes
from ctypes import wintypes
import sys


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
