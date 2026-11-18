"""Read Windows Terminal tab identities and positions via Windows UI Automation."""

import ctypes as ct
from collections import Counter
from contextlib import contextmanager
from ctypes import wintypes as wt
import os
import re
import sys
import time
import uuid


TAB_ENV = "AI_CHAT_SCOPE_TERMINAL_TAB"
TERMINAL_CLASS = "CASCADIA_HOSTING_WINDOW_CLASS"
_TAB_FORMAT = re.compile(r"[1-9][0-9]{0,9}(?:,-?[0-9]{1,10}){1,16}")


def parse_tab(value):
    if not isinstance(value, str) or len(value) > 200 or not _TAB_FORMAT.fullmatch(value):
        return None
    window, *runtime_id = map(int, value.split(","))
    if window >= 2**32 or any(not -(2**31) <= part < 2**31 for part in runtime_id):
        return None
    return window, tuple(runtime_id)


class _VariantValue(ct.Union):
    _fields_ = [("int32", ct.c_int32), ("record", ct.c_void_p * 2), ("double", ct.c_double)]


class _Variant(ct.Structure):
    _fields_ = [("type", wt.WORD), ("reserved", wt.WORD * 3), ("value", _VariantValue)]


def _check(result):
    if result < 0:
        raise OSError("UI Automation HRESULT 0x%08x" % (result & 0xffffffff))


def _method(interface, slot, result_type, *arg_types):
    vtable = ct.cast(interface, ct.POINTER(ct.POINTER(ct.c_void_p))).contents
    return ct.WINFUNCTYPE(result_type, ct.c_void_p, *arg_types)(vtable[slot])


def _call(interface, slot, *parameters):
    types = tuple(kind for kind, value in parameters)
    values = tuple(value for kind, value in parameters)
    _check(_method(interface, slot, ct.c_long, *types)(interface, *values))


@contextmanager
def _result_interface(interface, slot, *parameters):
    obj = ct.c_void_p()
    _call(interface, slot, *parameters, (ct.POINTER(ct.c_void_p), ct.byref(obj)))
    try:
        if not obj:
            raise OSError("UI Automation element unavailable")
        yield obj
    finally:
        if obj:
            _method(obj, 2, ct.c_ulong)(obj)  # IUnknown::Release


@contextmanager
def _automation():
    ole = ct.WinDLL("ole32")
    ole.CoInitializeEx.argtypes = [ct.c_void_p, wt.DWORD]
    ole.CoCreateInstance.argtypes = [
        ct.c_void_p, ct.c_void_p, wt.DWORD, ct.c_void_p, ct.POINTER(ct.c_void_p)]
    _check(ole.CoInitializeEx(None, 0))  # COINIT_MULTITHREADED
    automation = ct.c_void_p()
    try:
        # CLSID_CUIAutomation8 and IID_IUIAutomation2 from UIAutomationClient.h.
        clsid = (ct.c_ubyte * 16).from_buffer_copy(uuid.UUID("e22ad333-b25f-460c-83d0-0581107395c9").bytes_le)
        iid = (ct.c_ubyte * 16).from_buffer_copy(uuid.UUID("34723aff-0c9d-49d0-9896-7ab52df8cd8a").bytes_le)
        _check(ole.CoCreateInstance(clsid, None, 1, iid, ct.byref(automation)))
        # Limit the time the provider can block the polling worker.
        _call(automation, 61, (wt.DWORD, 250))  # IUIAutomation2::put_ConnectionTimeout
        _call(automation, 63, (wt.DWORD, 250))  # IUIAutomation2::put_TransactionTimeout
        yield automation
    finally:
        if automation:
            _method(automation, 2, ct.c_ulong)(automation)
        ole.CoUninitialize()


def _user32():
    api = ct.WinDLL("user32")
    api.GetForegroundWindow.restype = wt.HWND
    api.GetClassNameW.argtypes = [wt.HWND, wt.LPWSTR, ct.c_int]
    return api


def _is_terminal(api, window):
    name = ct.create_unicode_buffer(128)
    return bool(window and api.GetClassNameW(window, name, len(name)) and name.value == TERMINAL_CLASS)


def _runtime_id(element, ole):
    array = ct.c_void_p()
    _call(element, 4, (ct.POINTER(ct.c_void_p), ct.byref(array)))  # GetRuntimeId
    if not array:
        return None
    try:
        lower, upper = ct.c_long(), ct.c_long()
        _check(ole.SafeArrayGetLBound(array, 1, ct.byref(lower)))
        _check(ole.SafeArrayGetUBound(array, 1, ct.byref(upper)))
        length = upper.value - lower.value + 1
        if not 1 <= length <= 16:
            return None
        values = []
        for index in range(lower.value, upper.value + 1):
            offset, value = ct.c_long(index), ct.c_int32()
            _check(ole.SafeArrayGetElement(array, ct.byref(offset), ct.byref(value)))
            values.append(value.value)
        return tuple(values)
    finally:
        ole.SafeArrayDestroy(array)


def _tab_items(automation, window, *, names=False):
    variant = _Variant()
    variant.type, variant.value.int32 = 3, 50019  # VT_I4, UIA_TabItemControlTypeId
    ole = ct.WinDLL("oleaut32")
    ole.SysFreeString.argtypes = [ct.c_void_p]
    ole.SysFreeString.restype = None
    results = []
    # ElementFromHandle, CreatePropertyCondition(ControlType), FindAll(Descendants).
    with _result_interface(automation, 6, (wt.HWND, window)) as root:
        with _result_interface(automation, 23, (ct.c_int, 30003), (_Variant, variant)) as condition:
            with _result_interface(root, 6, (ct.c_int, 4), (ct.c_void_p, condition)) as elements:
                count = ct.c_int()
                _call(elements, 3, (ct.POINTER(ct.c_int), ct.byref(count)))  # get_Length
                if not 0 <= count.value <= 128:
                    return results
                for index in range(count.value):
                    try:
                        with _result_interface(elements, 4, (ct.c_int, index)) as element:
                            bounds = wt.RECT()
                            _call(element, 43, (ct.POINTER(wt.RECT), ct.byref(bounds)))  # get_CurrentBoundingRectangle
                            if bounds.right <= bounds.left or bounds.bottom <= bounds.top:
                                continue
                            runtime_id = _runtime_id(element, ole)
                            if runtime_id is None:
                                continue
                            name = ""
                            if names:
                                bstr = ct.c_void_p()
                                _call(element, 23, (ct.POINTER(ct.c_void_p), ct.byref(bstr)))  # get_CurrentName
                                try:
                                    name = ct.wstring_at(bstr) if bstr else ""
                                finally:
                                    ole.SysFreeString(bstr)
                            results.append(((window, runtime_id), bounds.left, name))
                    except OSError:
                        continue  # The tab can disappear during a read.
    return results


def terminal_positions(tabs):
    wanted = set(tabs)
    counts = Counter(window for window, runtime_id in wanted)
    windows = [window for window, count in counts.items() if count >= 2]
    if os.name != "nt" or not windows:
        return {}
    positions = {}
    try:
        api = _user32()
        with _automation() as automation:
            for window in windows:
                if not _is_terminal(api, window):
                    continue
                try:
                    pairs = [(tab, x) for tab, x, name in _tab_items(automation, window) if tab in wanted]
                except OSError:
                    continue
                if len({x for tab, x in pairs}) == len(pairs):
                    positions.update(pairs)
    except OSError:
        return {}
    return positions


def register_tab(marker):
    if os.name != "nt" or not re.fullmatch(r"\[ACS:[0-9a-f]{8}\]", marker):
        return None
    api = _user32()
    try:
        with _automation() as automation:
            deadline = time.monotonic() + .6
            while time.monotonic() < deadline:
                window = api.GetForegroundWindow()
                if _is_terminal(api, window):
                    items = _tab_items(automation, window, names=True)
                    matches = [tab for tab, x, name in items if name.endswith(marker)]
                    if len(matches) == 1:
                        handle, runtime_id = matches[0]
                        return ",".join(map(str, (handle, *runtime_id)))
                time.sleep(.04)
    except OSError:
        return None
    return None


if __name__ == "__main__" and len(sys.argv) == 2:
    value = register_tab(sys.argv[1])
    if value is not None:
        print(value)
