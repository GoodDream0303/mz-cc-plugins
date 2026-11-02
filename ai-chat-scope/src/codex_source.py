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

UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
ROLLOUT = re.compile(r".*-(" + UUID_PATTERN + r")\.jsonl$", re.I)


def safe_path(path, root):
    try:
        return (not path.is_symlink() and not (hasattr(path, "is_junction") and path.is_junction())
                and path.resolve().is_relative_to(root.resolve()))
    except (OSError, RuntimeError):
        return False


def display_text(value, limit=200):
    return re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()[:limit] if isinstance(value, str) else ""


class CodexSource:
    def __init__(self, home=None, lock_probe=probe_writer_lock):
        self.home = Path(home or os.environ.get("CODEX_HOME") or Path.home() / ".codex").resolve()
        self.lock_probe = lock_probe
        self.diagnostics = ()
        self._active = set()
        self._uncertain = set()
        self._locks_iter = None
        self._locks_stamp = None
        self._locks_due = 0
        self._paths = {}
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
        if self._scan_iter is None and not self._scan_dirs and time.monotonic() >= self._scan_due:
            preferred = []
            for sid in self._active:
                identity = uuid.UUID(sid)
                if identity.version == 7:
                    day = datetime.fromtimestamp((identity.int >> 80) / 1000, timezone.utc)
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
                    self._paths[match[1].lower()] = path

    @staticmethod
    def _new_state():
        return {"generation": -1, "meta": {}, "state": "stby", "turn": None}

    def _apply(self, state, record):
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
        self._locks(notes)
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
            if path is None or not safe_path(path, self.home / "sessions"):
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
            if not meta and freshness == "syncing":
                notes.add("Codex：正在同步会话信息")
            if ((meta.get("id") or meta.get("session_id")) != sid
                    or meta.get("source") != "cli" or meta.get("thread_source") not in (None, "user")):
                continue
            cwd = meta.get("cwd") if isinstance(meta.get("cwd"), str) else ""
            title = self._titles.get(sid) or display_text(meta.get("title") or meta.get("name")) or Path(cwd).name or sid[:8]
            try:
                started = datetime.fromisoformat(str(meta.get("timestamp")).replace("Z", "+00:00")).timestamp()
            except (ValueError, OverflowError):
                started = 0.0
            detail = "同步日志中" if freshness == "syncing" else ("执行中" if state["state"] == "run" else "待机")
            snapshots.append(SessionSnapshot("codex", sid, cwd=cwd, title=title,
                state=state["state"], state_detail=detail, started_at=started,
                freshness=freshness, capabilities=("copy_id",)))
        if snapshots:
            notes.add("Codex：授权提示需连接实时服务")
        self.diagnostics = tuple(sorted(notes))
        return sorted(snapshots, key=lambda value: (value.started_at, value.session_id))
