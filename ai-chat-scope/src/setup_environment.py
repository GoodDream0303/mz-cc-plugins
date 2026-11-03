"""First-run checks shared by setup and the interactive launcher."""
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile

from runtime_paths import runtime_root, claude_home, load_window_config


class SetupError(RuntimeError):
    """An actionable setup failure, safe to display without a traceback."""


def _check_tk():
    try:
        tk = importlib.import_module('tkinter')
    except ImportError as error:
        raise SetupError('Missing tkinter. Install or repair Python with Tcl/Tk support.') from error
    try:
        root = tk.Tk()
        try:
            root.withdraw()
        finally:
            root.destroy()
    except Exception as error:
        raise SetupError('Tk could not initialize. Check the Python Tcl/Tk installation and Windows desktop session.') from error


def _validate_config(path):
    try:
        with path.open('r', encoding='utf-8-sig') as stream:
            raw = stream.read(65537)
        if len(raw) > 65536 or not isinstance(json.loads(raw), dict):
            raise ValueError('invalid config')
    except (OSError, ValueError, UnicodeError) as error:
        raise SetupError('Invalid or unreadable config.json. Back up and repair this file: ' + str(path)) from error


def prepare_environment(plugin_root, initialize=False):
    """Check real GUI/write access and optionally create missing config only.

    Checking may create the owned runtime directory and a transient write probe;
    source data roots are only inspected. Existing config is never rewritten.
    """
    if sys.platform != 'win32':
        raise SetupError('AI Chat Scope currently supports Windows only.')
    if sys.version_info < (3, 9):
        raise SetupError('Python 3.9+ is required. Upgrade Python or use py -3.')
    if not (Path(plugin_root) / 'src/scope.pyw').is_file():
        raise SetupError('Missing src/scope.pyw. Reinstall the plugin from the official marketplace.')
    _check_tk()
    root = runtime_root()
    config = root / 'config.json'
    legacy = Path(os.environ.get('LOCALAPPDATA') or Path.home()) / 'claude-scope/config.json'
    try:
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(prefix='.scope-write-', dir=root) as probe:
            probe.write(b'scope')
            probe.flush()
        if config.exists():
            _validate_config(config)
        elif initialize:
            data = load_window_config(config, legacy)
            try:
                with config.open('x', encoding='utf-8', newline='\n') as stream:
                    json.dump(data, stream, ensure_ascii=False, allow_nan=False, indent=2)
                    stream.write('\n')
            except FileExistsError:
                _validate_config(config)
    except OSError as error:
        raise SetupError('The runtime directory is unavailable or not writable. Check permissions: ' + str(root)) from error
    claude = claude_home()
    codex = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex').absolute()
    messages = []
    if not (claude / 'sessions').is_dir():
        messages.append('No Claude sessions directory yet; sessions will be discovered after Claude Code starts.')
    if not (codex / 'thread-writer-locks').is_dir():
        messages.append('No Codex writer-lock directory yet; sessions will be discovered after a compatible Codex CLI starts.')
    return {'python': sys.executable, 'runtime': str(root), 'config': str(config),
            'claude_home': str(claude), 'codex_home': str(codex), 'messages': messages}
