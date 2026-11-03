"""Windows launcher for the shared, single-instance monitor."""
import argparse
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from runtime_paths import runtime_root
from setup_environment import prepare_environment, SetupError


def start_scope(plugin_root, extra_args=()):
    entry = Path(plugin_root).resolve() / "src" / "scope.pyw"
    if sys.platform != "win32" or not entry.is_file():
        return 1
    interpreter = Path(sys.executable)
    windowed = interpreter.with_name("pythonw.exe")
    if windowed.is_file():
        interpreter = windowed
    try:
        root = runtime_root()
        root.mkdir(parents=True, exist_ok=True)
        with (root / 'startup.log').open('ab') as error_log:
            child = subprocess.Popen([str(interpreter), "-B", str(entry)] + list(extra_args),
                cwd=str(entry.parent), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=error_log, creationflags=subprocess.CREATE_NO_WINDOW,
                close_fds=True)
            try:
                code = child.wait(timeout=.4)
                return 0 if code == 0 else 1
            except subprocess.TimeoutExpired:
                return 0
    except OSError:
        return 1


def main():
    # Redirected stdio on English Windows may use a non-Unicode code page.
    # Keep that encoding, but never fail setup because a path is unencodable.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='backslashreplace')
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--setup', action='store_true', help='Check the environment and create missing configuration')
    mode.add_argument('--check', action='store_true', help='Check without creating configuration')
    parser.add_argument("--codex-endpoint")
    parser.add_argument("--codex-token-file")
    args = parser.parse_args()
    if bool(args.codex_endpoint) != bool(args.codex_token_file):
        parser.error("Supply both Codex connection arguments")
    if (args.setup or args.check) and args.codex_endpoint:
        parser.error('Connection arguments are used when launching; omit --setup/--check')
    plugin = Path(__file__).resolve().parents[1]
    try:
        report = prepare_environment(plugin, initialize=not args.check)
    except SetupError as error:
        print('AI Chat Scope: ' + str(error), file=sys.stderr)
        return 1
    if args.setup or args.check:
        print('AI Chat Scope environment checks passed. ' + (
            'Setup complete; existing configuration preserved.' if args.setup else 'Configuration was not changed.'))
        for field in ('python', 'runtime', 'config', 'claude_home', 'codex_home'):
            print(field + ': ' + report[field])
        for message in report['messages']:
            print(message)
        print('Basic monitoring is ready. Full Codex approval/question status requires an optional live service; review hook trust in /hooks.')
        return 0
    extra = []
    if args.codex_endpoint:
        extra = ["--codex-endpoint", args.codex_endpoint, "--codex-token-file", args.codex_token_file]
    status = start_scope(plugin, extra)
    print('AI Chat Scope launch requested; an existing instance will be reused.' if status == 0
          else 'AI Chat Scope could not start. Check plugin files and log: ' + str(runtime_root() / 'startup.log'))
    return status


if __name__ == "__main__":
    raise SystemExit(main())
