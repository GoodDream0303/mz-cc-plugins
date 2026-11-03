"""One-shot, user-requested standalone Codex CLI termination.

This module is run in a helper process, never by the passive monitor. No
transcript, hook trust, archive state or other process is modified.
"""
import argparse
import ctypes
from ctypes import wintypes as wt
import json
import ntpath
import os
from pathlib import Path
import sys
import uuid

from codex_source import safe_path
from win32_support import probe_writer_lock


def _lock_path(home, sid):
    if str(uuid.UUID(sid)) != sid:
        raise ValueError('会话 ID 无效。')
    home = Path(home).absolute()
    root = home / 'thread-writer-locks'
    path = root / (sid + '.lock')
    if (not safe_path(root, home) or not safe_path(path, root)
            or not root.is_dir() or not path.is_file()):
        raise ValueError('会话锁已消失或路径无法安全核对，请刷新后重试。')
    return path


def _owner(system, path):
    pids = system.owners(path)
    if (len(pids) != 1 or type(pids[0]) is not int or pids[0] <= 0
            or pids[0] in (os.getpid(), os.getppid()) or not system.held(path)):
        raise ValueError('无法确认唯一的会话锁持有进程，已取消关闭。')
    return pids[0]


def _interactive_argv(argv):
    # Known local interactive entry points only. Unknown flags/modes cancel.
    values = {'--config', '-c', '--enable', '--disable', '--image', '-i',
              '--model', '-m', '--local-provider', '--profile', '-p',
              '--sandbox', '-s', '--cd', '-C', '--add-dir', '--remote',
              '--remote-auth-token-env'}
    flags = {'--strict-config', '--oss', '--approve-for-me', '--no-alt-screen',
             '--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust',
             '--yolo', '--not-so-yolo', '--search', '--no-daemon', '--worktree',
             '--last', '--all', '--include-non-interactive'}
    positional = []
    index = 1
    while index < len(argv):
        arg = argv[index]
        if arg == '--':
            break  # Later arguments are prompt text, not a mode or flags.
        name, equal, value = arg.partition('=')
        if name in values:
            if not equal:
                index += 1
                if index >= len(argv):
                    return False
            elif not value:
                return False
        elif arg in flags:
            pass
        elif len(arg) > 2 and arg[:2] in values and arg[0] == '-' and arg[1] != '-':
            pass  # Attached short-option value, e.g. -mMODEL or -Cpath.
        elif arg.startswith('-'):
            return False
        else:
            positional.append(arg)
        index += 1
    return (not positional or positional[0] in ('resume', 'fork')
            or any(character.isspace() for character in positional[0]))


def _cli_identity(process):
    info = process.identity()
    argv = info.get('argv')
    if (ntpath.basename(info.get('image', '')).lower() != 'codex.exe'
            or not isinstance(argv, list) or not argv
            or not all(isinstance(arg, str) for arg in argv)
            or not _interactive_argv(argv)):
        raise ValueError('无法确认该进程是独立交互 Codex CLI，可能是共享服务、非交互模式或未知启动参数；已取消关闭。')
    if (type(info.get('pid')) is not int or type(info.get('started')) is not int
            or info['pid'] <= 0 or info['started'] <= 0):
        raise ValueError('无法核对进程身份，已取消关闭。')
    return {'pid': info['pid'], 'started': info['started']}


def inspect_session(home, sid, system=None):
    path = _lock_path(home, sid)
    system = system or WindowsSessionControl()
    pid = _owner(system, path)
    with system.open(pid) as process:
        identity = _cli_identity(process)
        if identity['pid'] != pid or _owner(system, path) != pid:
            raise ValueError('会话锁持有者已变化，已取消关闭。')
        return identity


def close_session(home, sid, expected, system=None):
    path = _lock_path(home, sid)
    system = system or WindowsSessionControl()
    pid = _owner(system, path)
    if (not isinstance(expected, dict) or set(expected) != {'pid', 'started'}
            or any(type(expected.get(key)) is not int for key in ('pid', 'started'))
            or expected['pid'] != pid):
        raise ValueError('会话进程已变化，已取消关闭。')
    with system.open(pid, terminate=True) as process:
        if _cli_identity(process) != expected or _owner(system, _lock_path(home, sid)) != pid:
            raise ValueError('会话进程身份或锁持有者已变化，已取消关闭。')
        # Terminate this checked process object, never a later lookup by PID.
        process.terminate()
        if not process.wait() or system.held(path):
            raise OSError('尚未确认进程退出并释放会话锁，请刷新后核对。')
    return expected


class WindowsSessionControl:
    def __init__(self):
        if sys.platform != 'win32':
            raise OSError('此操作仅支持 Windows。')

    def held(self, path):
        state = probe_writer_lock(path)
        if state == 'unavailable':
            raise OSError('无法读取会话锁，已取消关闭。')
        return state == 'held'

    def owners(self, path):
        class UniqueProcess(ctypes.Structure):
            _fields_ = [('pid', wt.DWORD), ('started', wt.FILETIME)]

        class ProcessInfo(ctypes.Structure):
            _fields_ = [('process', UniqueProcess), ('app', wt.WCHAR * 256),
                        ('service', wt.WCHAR * 64), ('kind', wt.UINT),
                        ('status', wt.ULONG), ('session', wt.DWORD), ('restartable', wt.BOOL)]

        api = ctypes.WinDLL('rstrtmgr', use_last_error=True)
        api.RmStartSession.argtypes = [ctypes.POINTER(wt.DWORD), wt.DWORD, wt.LPWSTR]
        api.RmRegisterResources.argtypes = [wt.DWORD, wt.UINT, ctypes.POINTER(wt.LPCWSTR),
                                           wt.UINT, ctypes.POINTER(UniqueProcess),
                                           wt.UINT, ctypes.POINTER(wt.LPCWSTR)]
        api.RmGetList.argtypes = [wt.DWORD, ctypes.POINTER(wt.UINT), ctypes.POINTER(wt.UINT),
                                 ctypes.POINTER(ProcessInfo), ctypes.POINTER(wt.DWORD)]
        api.RmEndSession.argtypes = [wt.DWORD]
        for name in ('RmStartSession', 'RmRegisterResources', 'RmGetList', 'RmEndSession'):
            getattr(api, name).restype = wt.DWORD
        handle, key = wt.DWORD(), ctypes.create_unicode_buffer(33)
        if api.RmStartSession(ctypes.byref(handle), 0, key):
            raise OSError('无法创建会话锁查询。')
        try:
            paths = (wt.LPCWSTR * 1)(str(path))
            if api.RmRegisterResources(handle, 1, paths, 0, None, 0, None):
                raise OSError('无法查询会话锁持有者。')
            needed, count, reason = wt.UINT(), wt.UINT(), wt.DWORD()
            result = api.RmGetList(handle, ctypes.byref(needed), ctypes.byref(count),
                                   None, ctypes.byref(reason))
            if result not in (0, 234) or needed.value > 64:
                raise OSError('会话锁持有者查询失败。')
            records = (ProcessInfo * max(1, needed.value))()
            count.value = len(records)
            if api.RmGetList(handle, ctypes.byref(needed), ctypes.byref(count),
                             records, ctypes.byref(reason)):
                raise OSError('会话锁持有者变化，请重试。')
            return [record.process.pid for record in records[:count.value]]
        finally:
            api.RmEndSession(handle)

    def open(self, pid, terminate=False):
        return WindowsProcess(pid, terminate)


class WindowsProcess:
    def __init__(self, pid, terminate=False):
        self.pid = pid
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        signatures = {
            'OpenProcess': ([wt.DWORD, wt.BOOL, wt.DWORD], wt.HANDLE),
            'CloseHandle': ([wt.HANDLE], wt.BOOL),
            'GetProcessTimes': ([wt.HANDLE] + [ctypes.POINTER(wt.FILETIME)] * 4, wt.BOOL),
            'QueryFullProcessImageNameW': ([wt.HANDLE, wt.DWORD, wt.LPWSTR,
                                            ctypes.POINTER(wt.DWORD)], wt.BOOL),
            'TerminateProcess': ([wt.HANDLE, wt.UINT], wt.BOOL),
            'WaitForSingleObject': ([wt.HANDLE, wt.DWORD], wt.DWORD),
            'LocalFree': ([ctypes.c_void_p], ctypes.c_void_p),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.kernel, name)
            function.argtypes, function.restype = args, result
        # QUERY_LIMITED_INFORMATION, SYNCHRONIZE, optionally TERMINATE.
        self.handle = self.kernel.OpenProcess(0x1000 | 0x100000 | int(terminate), False, pid)
        if not self.handle:
            raise OSError('无法打开所选进程进行身份核对。')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.kernel.CloseHandle(self.handle)
        self.handle = None

    def identity(self):
        times = [wt.FILETIME() for _ in range(4)]
        image, size = ctypes.create_unicode_buffer(32768), wt.DWORD(32768)
        if (not self.kernel.GetProcessTimes(self.handle, *[ctypes.byref(t) for t in times])
                or not self.kernel.QueryFullProcessImageNameW(self.handle, 0, image, ctypes.byref(size))):
            raise OSError('无法核对进程启动时间或可执行文件。')
        return {'pid': self.pid, 'started': (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime,
                'image': image.value, 'argv': self._argv()}

    def _argv(self):
        query = ctypes.WinDLL('ntdll').NtQueryInformationProcess
        query.argtypes = [wt.HANDLE, wt.ULONG, ctypes.c_void_p, wt.ULONG, ctypes.POINTER(wt.ULONG)]
        query.restype = wt.LONG
        size = wt.ULONG()
        query(self.handle, 60, None, 0, ctypes.byref(size))
        if not 0 < size.value <= 1048576:
            raise OSError('无法核对进程运行模式。')
        raw = ctypes.create_string_buffer(size.value)
        if query(self.handle, 60, raw, size, ctypes.byref(size)) != 0:
            raise OSError('无法核对进程运行模式。')

        class UnicodeString(ctypes.Structure):
            _fields_ = [('length', wt.USHORT), ('maximum', wt.USHORT), ('buffer', ctypes.c_void_p)]

        text = UnicodeString.from_buffer(raw)
        if (text.length % 2 or not text.buffer or text.buffer < ctypes.addressof(raw)
                or text.buffer + text.length > ctypes.addressof(raw) + len(raw)):
            raise OSError('进程运行模式数据无效。')
        command = ctypes.wstring_at(text.buffer, text.length // 2)
        shell = ctypes.WinDLL('shell32', use_last_error=True)
        shell.CommandLineToArgvW.argtypes = [wt.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
        shell.CommandLineToArgvW.restype = ctypes.POINTER(wt.LPWSTR)
        count = ctypes.c_int()
        arguments = shell.CommandLineToArgvW(command, ctypes.byref(count))
        if not arguments:
            raise OSError('无法解析进程运行模式。')
        try:
            return list(arguments[:count.value])
        finally:
            self.kernel.LocalFree(arguments)

    def terminate(self):
        if not self.kernel.TerminateProcess(self.handle, 1):
            raise OSError('Windows 未能结束所选进程。')

    def wait(self):
        return self.kernel.WaitForSingleObject(self.handle, 5000) == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('inspect', 'close'))
    parser.add_argument('--home', required=True)
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--pid', type=int)
    parser.add_argument('--started', type=int)
    args = parser.parse_args()
    try:
        if args.action == 'inspect':
            identity = inspect_session(args.home, args.session_id)
        else:
            identity = close_session(args.home, args.session_id, {'pid':args.pid, 'started':args.started})
        print(json.dumps({'ok': True, 'identity': identity}))
        return 0
    except (OSError, ValueError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
