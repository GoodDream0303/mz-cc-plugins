#!/usr/bin/env python3
"""Resolve handoff paths and session provenance without writing files (Python 3.8+)."""

import argparse
import json
import os
from pathlib import Path
import sys


def absolute_path(value):
    if '${' in value or '$ARGUMENTS' in value:
        raise ValueError('Unexpanded configuration placeholder; supply a real absolute path.')
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError('The handoff root / CODEX_HOME must be an absolute path.')
    return path.resolve()


def resolve_context(host, root=None, session_id=None):
    if host not in ('codex', 'claude'):
        raise ValueError('Specify the actual host: codex or claude.')
    configured = root or os.environ.get('TASK_HANDOFF_ROOT')
    if configured:
        data_root = absolute_path(configured)
    elif host == 'codex':
        codex_home = os.environ.get('CODEX_HOME')
        data_root = (absolute_path(codex_home) if codex_home else Path.home() / '.codex') / 'task-handoff'
    else:
        data_root = Path.home() / '.claude' / 'task-handoff'
    variable = 'CODEX_THREAD_ID' if host == 'codex' else 'CLAUDE_CODE_SESSION_ID'
    session_id = (session_id if session_id is not None else os.environ.get(variable, '')).strip() or None
    if session_id and ('${' in session_id or any(c.isspace() for c in session_id)):
        raise ValueError('Invalid session ID; do not store unresolved placeholders.')
    plugin_root = Path(__file__).resolve().parent.parent
    return {
        'host': host,
        'root': str(data_root),
        'index': str(data_root / 'INDEX.md'),
        'check_script': str(plugin_root / 'scripts' / 'handoff_check.py'),
        'session_id': session_id,
        'session_ref': '{}:{}'.format(host, session_id or 'unknown'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True, choices=['codex', 'claude'])
    parser.add_argument('--root', help='Explicit absolute data root; overrides TASK_HANDOFF_ROOT.')
    parser.add_argument('--session-id', help='Actual current session ID rendered by the host; overrides its environment value.')
    args = parser.parse_args()
    try:
        context = resolve_context(args.host, args.root, args.session_id)
    except ValueError as exc:
        parser.error(str(exc))
    # ASCII JSON remains readable by either host regardless of shell code page.
    sys.stdout.write(json.dumps(context, ensure_ascii=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
