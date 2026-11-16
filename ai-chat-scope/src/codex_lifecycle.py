"""Optional CLI-start metadata; observers only read these bounded runtime files."""
import json
import os
from pathlib import Path
import time
import uuid

from runtime_paths import home_events_root, _plain_directory, _inside, _remove_event_file

START_SOURCES = frozenset(('startup', 'clear', 'resume'))


def _marker_path(runtime, home, sid):
    folder = _plain_directory(home_events_root(runtime, home) / str(uuid.UUID(sid)))
    path = folder / 'lifecycle.json'
    if not _inside(path, folder):
        raise ValueError('lifecycle file escapes runtime directory')
    return path


def capture_session_start(runtime, home, payload):
    if (payload.get('hook_event_name') != 'SessionStart'
            or not isinstance(payload.get('source'), str) or payload['source'] not in START_SOURCES):
        return
    sid = str(uuid.UUID(payload['session_id']))
    path = _marker_path(runtime, home, sid)
    # A new start invalidates the earlier claim even when its subsequent
    # identity query fails or the resumed recorder keeps the same filename.
    _remove_event_file(path, home_events_root(runtime, home))
    transcript = payload.get('transcript_path')
    if not isinstance(transcript, str) or not transcript or len(transcript) > 32768:
        return
    # Native same-process resume can return a verbatim drive path. Normalize
    # that spelling before checking it against the regular CODEX_HOME path.
    if (os.name == 'nt' and transcript.startswith('\\\\?\\')
            and len(transcript) > 7 and transcript[5:7] == ':\\'):
        transcript = transcript[4:]
    home, recording = Path(home).resolve(), Path(transcript)
    from codex_source import ROLLOUT, safe_path
    match = ROLLOUT.fullmatch(recording.name)
    if (not recording.is_absolute() or not match or match[1].lower() != sid
            or not safe_path(home / 'sessions', home)
            or not safe_path(recording, home / 'sessions')):
        return
    # This runs only in the already short-lived hook, never in the observer.
    from codex_close import session_owner
    owner = session_owner(home, sid)
    record = {'schema_version':1, 'session_id':sid, 'start_source':payload['source'],
              'observed_ns':time.monotonic_ns(), 'owner':owner, 'recording_name':recording.name}
    path.parent.mkdir(parents=True, exist_ok=True)
    _plain_directory(path.parent)
    temporary = path.with_name('lifecycle-' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8', newline='\n') as output:
            json.dump(record, output)
            output.write('\n')
        _plain_directory(path.parent)
        temporary.replace(path)
    finally:
        _remove_event_file(temporary, home_events_root(runtime, home))


def _read_start(runtime, home, sid, recording):
    path = _marker_path(runtime, home, sid)
    try:
        with path.open('rb') as source:
            raw = source.read(65537)
        if len(raw) > 65536:
            return None
        record = json.loads(raw)
    except FileNotFoundError:
        return None
    except (ValueError, UnicodeError):
        return None
    if not isinstance(record, dict):
        return None
    owner, stamp = record.get('owner'), record.get('observed_ns')
    if (type(record.get('schema_version')) is not int or record['schema_version'] != 1
            or record.get('session_id') != sid or not isinstance(record.get('start_source'), str)
            or record['start_source'] not in START_SOURCES
            or not isinstance(owner, dict) or set(owner) != {'pid', 'started'}
            or any(type(owner.get(key)) is not int or owner[key] <= 0 for key in ('pid','started'))
            or type(stamp) is not int or not 0 <= stamp <= time.monotonic_ns()
            or not isinstance(record.get('recording_name'), str)
            or os.path.normcase(record['recording_name']) != os.path.normcase(Path(recording).name)):
        return None
    return record


def current_session_ids(runtime, home, recordings):
    visible, groups = set(recordings), {}
    for sid, recording in recordings.items():
        record = _read_start(runtime, home, sid, recording)
        if record is not None:
            owner = record['owner']
            groups.setdefault((owner['pid'],owner['started']), []).append((record['observed_ns'],sid))
    for records in groups.values():
        newest = max(stamp for stamp, sid in records)
        current = [sid for stamp, sid in records if stamp == newest]
        if len(current) == 1:
            visible.difference_update(sid for stamp, sid in records if sid != current[0])
    return visible
