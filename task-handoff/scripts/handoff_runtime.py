#!/usr/bin/env python3
"""Resolve handoff context; persist a confirmed Codex root only with --save-root."""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile


def absolute_path(value):
    if '${' in value or '$ARGUMENTS' in value:
        raise ValueError('Unexpanded configuration placeholder; supply a real absolute path.')
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError('The handoff root / CODEX_HOME must be an absolute path.')
    return path.resolve()


def codex_config_path():
    home = os.environ.get('CODEX_HOME')
    return (absolute_path(home) if home else Path.home() / '.codex') / 'task-handoff-config.json'


def read_codex_root():
    config = codex_config_path()
    if not config.exists():
        return None
    try:
        data = json.loads(config.read_text(encoding='utf-8-sig'))
        value = data.get('handoff_root') if isinstance(data, dict) else None
        if not isinstance(value, str) or not value.strip():
            raise ValueError('handoff_root must be a non-empty absolute path')
        return absolute_path(value)
    except (OSError, ValueError) as exc:
        raise ValueError('Invalid Codex handoff configuration {}: {}'.format(config, exc)) from exc


def save_codex_root(root):
    """Called only after the agent obtains the user's directory confirmation."""
    target = absolute_path(root)
    if target.exists() and not target.is_dir():
        raise ValueError('The handoff root must be a directory, not a file.')
    config = codex_config_path()
    config.parent.mkdir(parents=True, exist_ok=True)
    # Atomic replacement preserves the previous config on a failed write.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                     dir=str(config.parent), delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(json.dumps({'handoff_root': str(target)}, ensure_ascii=False, indent=2) + '\n')
        except BaseException:
            stream.close()
            temporary.unlink()
            raise
    try:
        os.replace(str(temporary), str(config))
    finally:
        if temporary.exists():
            temporary.unlink()


def resolve_context(host, root=None, session_id=None):
    if host not in ('codex', 'claude'):
        raise ValueError('Specify the actual host: codex or claude.')
    configured = root or os.environ.get('TASK_HANDOFF_ROOT')
    if configured:
        data_root = absolute_path(configured)
    elif host == 'codex':
        data_root = read_codex_root()
    else:
        data_root = Path.home() / '.claude' / 'task-handoff'
    variable = 'CODEX_THREAD_ID' if host == 'codex' else 'CLAUDE_CODE_SESSION_ID'
    session_id = (session_id if session_id is not None else os.environ.get(variable, '')).strip() or None
    if session_id and ('${' in session_id or any(c.isspace() for c in session_id)):
        raise ValueError('Invalid session ID; do not store unresolved placeholders.')
    plugin_root = Path(__file__).resolve().parent.parent
    return {
        'host': host,
        'root': str(data_root) if data_root is not None else None,
        'index': str(data_root / 'INDEX.md') if data_root is not None else None,
        'needs_setup': data_root is None,
        'config_path': str(codex_config_path()) if host == 'codex' else None,
        'check_script': str(plugin_root / 'scripts' / 'handoff_check.py'),
        'session_id': session_id,
        'session_ref': '{}:{}'.format(host, session_id or 'unknown'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True, choices=['codex', 'claude'])
    parser.add_argument('--root', help='Explicit absolute data root; overrides TASK_HANDOFF_ROOT.')
    parser.add_argument('--session-id', help='Actual current session ID rendered by the host; overrides its environment value.')
    parser.add_argument('--save-root', action='store_true', help='Persist --root for Codex after user confirmation; does not create task data.')
    args = parser.parse_args()
    if args.save_root and (args.host != 'codex' or not args.root):
        parser.error('--save-root requires --host codex and an explicit --root')
    try:
        context = resolve_context(args.host, args.root, args.session_id)
        if args.save_root:
            save_codex_root(args.root)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    # ASCII JSON remains readable by either host regardless of shell code page.
    sys.stdout.write(json.dumps(context, ensure_ascii=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
