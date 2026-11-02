"""Read active Codex CLI logs without databases or process access."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import time
import uuid

from jsonl_reader import JsonlReader
from session_types import SessionSnapshot
from win32_support import probe_writer_lock
from codex_wait import AsyncAttention
from runtime_paths import runtime_root, home_events_root, consume_events

UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
ROLLOUT = re.compile(r".*-(" + UUID_PATTERN + r")(?:_(" + UUID_PATTERN + r"))?\.jsonl$", re.I)


def safe_path(path, root):
    try:
        return (not path.is_symlink() and not (hasattr(path, "is_junction") and path.is_junction())
                and path.resolve().is_relative_to(root.resolve()))
    except (OSError, RuntimeError):
        return False


def display_text(value, limit=200):
    return re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()[:limit] if isinstance(value, str) else ""


class CodexSource:
    provider = "Codex"
    def __init__(self, home=None, lock_probe=probe_writer_lock, live=None, runtime_dir=None):
        self.home = Path(home or os.environ.get("CODEX_HOME") or Path.home() / ".codex").resolve()
        self.lock_probe = lock_probe
        self.live = live
        self._runtime_dir = Path(runtime_dir) if runtime_dir is not None else runtime_root()
        self.diagnostics = ()
        self._active = set()
        self._uncertain = set()
        self._locks_iter = None
        self._locks_stamp = None
        self._locks_due = 0
        self._paths = {}
        self._path_ordinals = {}
        self._scan_dirs = []
        self._scan_iter = None
        self._scan_seen = set()
        self._scan_due = 0
        self._readers = {}
        self._states = {}
        self._titles = {}
        self._title_reader = JsonlReader(self.home / "session_index.jsonl")
        self._title_generation = self._title_reader.generation

    def _locks(self, notes):
        root = self.home / "thread-writer-locks"
        self._uncertain.clear()
        if not root.is_dir() or not safe_path(root, self.home):
            self._uncertain.update(self._active)
            notes.add("Codex：未找到可读取的会话锁目录")
            return
        for sid in tuple(self._active):
            path = root / (sid + ".lock")
            state = self.lock_probe(path) if safe_path(path, root) else "unavailable"
            if state == "released":
                self._active.discard(sid)
            elif state != "held":
                self._uncertain.add(sid)
        stamp = root.stat().st_mtime_ns
        if self._locks_iter is None and (stamp != self._locks_stamp or time.monotonic() >= self._locks_due):
            self._locks_iter = iter(root.iterdir())
            self._locks_stamp = stamp
        if self._locks_iter is None:
            return
        for _ in range(256):
            try:
                path = next(self._locks_iter)
            except StopIteration:
                self._locks_iter = None
                self._locks_due = time.monotonic() + 10
                break
            if not re.fullmatch(UUID_PATTERN + r"\.lock", path.name, re.I) or not safe_path(path, root):
                continue
            sid = path.stem.lower()
            if sid in self._active:
                continue
            state = self.lock_probe(path)
            if state == "held":
                self._active.add(sid)
            elif state == "unavailable":
                notes.add("Codex：部分会话锁无法读取")

    def _paths_step(self):
        root = self.home / "sessions"
        if not root.is_dir() or not safe_path(root, self.home):
            return
        if self._scan_iter is None and not self._scan_dirs:
            # Waiting polls must not move the next scan deadline forward.
            if time.monotonic() < self._scan_due:
                return
            preferred = []
            for sid in self._active:
                identity = uuid.UUID(sid)
                if identity.version == 7:
                    try:
                        day = datetime.fromtimestamp((identity.int >> 80) / 1000, timezone.utc)
                    except (ValueError, OverflowError, OSError):
                        continue
                    for delta in (-1, 0, 1):
                        date = day + timedelta(days=delta)
                        directory = root / date.strftime("%Y/%m/%d")
                        if directory.is_dir():
                            preferred.append(directory)
            self._scan_dirs = list(dict.fromkeys([root] + preferred))
            self._scan_seen = set()
        for _ in range(256):
            if self._scan_iter is None:
                while self._scan_dirs:
                    directory = self._scan_dirs.pop()
                    if directory in self._scan_seen or not safe_path(directory, root):
                        continue
                    self._scan_seen.add(directory)
                    try:
                        self._scan_iter = os.scandir(directory)
                    except OSError:
                        continue
                    break
                if self._scan_iter is None:
                    self._scan_due = time.monotonic() + 10
                    return
            try:
                entry = next(self._scan_iter)
            except StopIteration:
                self._scan_iter.close()
                self._scan_iter = None
                continue
            path = Path(entry.path)
            if not safe_path(path, root):
                continue
            if entry.is_dir(follow_symlinks=False):
                self._scan_dirs.append(path)
            else:
                match = ROLLOUT.fullmatch(entry.name)
                if match and match[1].lower() in self._active:
                    sid = match[1].lower()
                    previous = self._paths.get(sid)
                    if previous is None or (previous != path and self._recording_rank(path, sid) > self._recording_rank(previous, sid)):
                        self._paths[sid] = path

    def _recording_rank(self, path, sid):
        """A resumed recorder keeps the thread ID but advances its history base."""
        if not self._session_path(path):
            return (-1, 0, 0, "")
        try:
            info = path.stat()
            identity = (info.st_dev, info.st_ino, getattr(info, "st_birthtime_ns", 0))
            cached = self._path_ordinals.get(path)
            if cached is None or cached[0] != identity:
                with path.open("rb") as stream:
                    raw = stream.readline(2097153)
                if len(raw) > 2097152:
                    return (-1, 0, 0, "")
                record = json.loads(raw)
                if not isinstance(record, dict):
                    return (-1, 0, 0, "")
                meta = record.get("payload")
                if (record.get("type") != "session_meta" or not isinstance(meta, dict)
                        or (meta.get("id") or meta.get("session_id")) != sid):
                    return (-1, 0, 0, "")
                base = meta.get("history_base")
                ordinal = base.get("end_ordinal_exclusive", 0) if isinstance(base, dict) and base.get("thread_id", sid) == sid else 0
                if type(ordinal) is not int or not 0 <= ordinal < 2**64:
                    ordinal = 0
                self._path_ordinals[path] = (identity, ordinal)
                while len(self._path_ordinals) > 256:
                    self._path_ordinals.pop(next(iter(self._path_ordinals)))
            ordinal = self._path_ordinals[path][1]
            match = ROLLOUT.fullmatch(path.name)
            return (ordinal, bool(match and match[2]), info.st_mtime_ns, path.name)
        except (OSError, ValueError, UnicodeError):
            return (-1, 0, 0, "")

    def _session_path(self, path):
        root = self.home / "sessions"
        return safe_path(root, self.home) and safe_path(path, root)

    @staticmethod
    def _new_state():
        return {"generation": -1, "meta": {}, "state": "stby", "turn": None,
                "attention": AsyncAttention()}

    def _apply(self, state, record):
        state["attention"].apply(record)
        payload = record.get("payload")
        if not isinstance(payload, dict):
            return
        if record.get("type") == "session_meta":
            state["meta"] = {key: payload.get(key) for key in (
                "id", "session_id", "source", "thread_source", "cwd", "timestamp", "title", "name")}
        elif record.get("type") == "event_msg":
            kind, turn = payload.get("type"), payload.get("turn_id")
            if kind == "task_started":
                state["turn"], state["state"] = turn, "run"
            elif kind in ("task_complete", "turn_aborted") and (turn is None or turn == state["turn"]):
                state["state"] = "stby"

    def poll(self):
        notes = set()
        live_rows = self.live.poll() if self.live is not None else {}
        live_available = self.live is not None and self.live.available
        if self.live is not None:
            notes.update(self.live.diagnostics)
        self._locks(notes)
        if live_available:
            self._active.update(sid for sid in live_rows if re.fullmatch(UUID_PATTERN, sid, re.I))
        for sid, row in live_rows.items():
            path = row.get("path")
            if (sid in self._active and isinstance(path, str)
                    and self._session_path(Path(path))):
                self._paths[sid] = Path(path)
        self._paths_step()
        if safe_path(self._title_reader.path, self.home):
            try:
                title_records = self._title_reader.read()
                if self._title_generation != self._title_reader.generation:
                    self._titles.clear()
                    self._title_generation = self._title_reader.generation
                for record in title_records:
                    sid, title = record.get("id"), display_text(record.get("thread_name"))
                    if isinstance(sid, str) and title:
                        self._titles[sid] = title
                while len(self._titles) > 4096:
                    self._titles.pop(next(iter(self._titles)))
            except OSError:
                pass
        for sid in set(self._readers) - self._active:
            self._readers.pop(sid, None)
            self._states.pop(sid, None)
            self._paths.pop(sid, None)
        snapshots = []
        for sid in sorted(self._active):
            path = self._paths.get(sid)
            if path is None or not self._session_path(path):
                notes.add("Codex：部分活跃会话日志尚未发现")
                continue
            reader = self._readers.get(sid)
            if reader is None or reader.path != path:
                reader = self._readers[sid] = JsonlReader(path)
                self._states[sid] = self._new_state()
            state = self._states[sid]
            freshness = "fresh"
            try:
                records = reader.read()
                if state["generation"] != reader.generation:
                    state = self._states[sid] = self._new_state()
                    state["generation"] = reader.generation
                for record in records:
                    self._apply(state, record)
                if not reader.caught_up:
                    freshness = "syncing"
            except OSError:
                freshness = "stale"
                notes.add("Codex：部分日志暂时无法读取")
            if sid in self._uncertain:
                freshness = "stale"
            meta = state["meta"]
            try:
                hook_events = consume_events(home_events_root(self._runtime_dir, self.home), sid)
            except (OSError, ValueError):
                hook_events = []
                notes.add("Codex：辅助状态暂不可用")
            for event in hook_events:
                if (event.get("hook_event_name") == "Interrupt"
                        and isinstance(event.get("turn_id"), str)
                        and event["turn_id"] == state["turn"]):
                    self._apply(state, {"type": "event_msg", "payload": {
                        "type": "turn_aborted", "turn_id": event.get("turn_id")}})
            if not meta and freshness == "syncing":
                notes.add("Codex：正在同步会话信息")
            if ((meta.get("id") or meta.get("session_id")) != sid
                    or (meta.get("source") != "cli" and sid not in live_rows)
                    or meta.get("thread_source") not in (None, "user")):
                continue
            cwd = meta.get("cwd") if isinstance(meta.get("cwd"), str) else ""
            title = self._titles.get(sid) or display_text(meta.get("title") or meta.get("name")) or Path(cwd).name or sid[:8]
            try:
                started = datetime.fromisoformat(str(meta.get("timestamp")).replace("Z", "+00:00")).timestamp()
            except (ValueError, OverflowError, OSError):
                started = 0.0
            detail = "同步日志中" if freshness == "syncing" else ("执行中" if state["state"] == "run" else "待机")
            row_state = state["state"]
            capabilities = ["copy_id", "async_input"]
            native = live_rows.get(sid)
            if live_available and native is not None and native.get("state") in ("run", "stby", "attn"):
                row_state = native["state"]
                detail = native.get("state_detail") or detail
                capabilities.extend(("authorization", "sync_input"))
                title = self._titles.get(sid) or display_text(native.get("name")) or title
            elif native is not None:
                freshness = "stale"
            if state["attention"].waiting:
                row_state = "attn"
                if native is None or native.get("state") != "attn":
                    detail = "等待用户消息"
            snapshots.append(SessionSnapshot("codex", sid, cwd=cwd, title=title,
                state=row_state, state_detail=detail, started_at=started,
                freshness=freshness, capabilities=tuple(capabilities)))
        self.diagnostics = tuple(sorted(notes))
        return sorted(snapshots, key=lambda value: (value.started_at, value.session_id))

    def close(self):
        if self.live is not None:
            self.live.close()
        if self._scan_iter is not None:
            self._scan_iter.close()
