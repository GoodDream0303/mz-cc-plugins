"""Own runtime data only. No writes into Claude/Codex source directories."""
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

HOOK_NAMES = frozenset({"SessionStart", "SessionEnd", "PermissionRequest", "Stop", "Interrupt"})
EVENT_NAME = re.compile(r"\d{20}-[0-9a-f]{32}\.json\Z")


def runtime_root():
    override = os.environ.get("AI_CHAT_SCOPE_RUNTIME")
    return Path(override).resolve() if override else Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "ai-chat-scope"


def codex_home_key(home):
    return hashlib.sha256(os.path.normcase(str(Path(home).resolve())).encode("utf-8")).hexdigest()[:16]


def home_events_root(root, home):
    return Path(root) / "runtime" / "codex" / codex_home_key(home)


def _inside(path, root):
    return (not path.is_symlink() and not (hasattr(path, "is_junction") and path.is_junction())
            and path.resolve().is_relative_to(root.resolve()))


def publish_event(root, event):
    sid = str(uuid.UUID(event["session_id"]))
    kind = event.get("hook_event_name")
    stamp = event.get("observed_ns", time.monotonic_ns())
    if kind not in HOOK_NAMES or type(stamp) is not int or not 0 <= stamp < 2**64:
        raise ValueError("invalid metadata event")
    clean = {"schema_version": 1, "source": "hook", "session_id": sid,
             "hook_event_name": kind, "observed_ns": stamp}
    for key in ("turn_id", "tool_use_id", "tool_name"):
        value = event.get(key)
        if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_:.\-]{1,160}", value):
            clean[key] = value
    root = Path(root).resolve()
    folder = root / sid
    if not _inside(folder, root):
        raise ValueError("event directory escapes runtime root")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / ("%020d-%s.json" % (stamp, uuid.uuid4().hex))
    temporary = path.with_suffix(".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(clean, output, ensure_ascii=False)
            output.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    for old in sorted(folder.glob("*.json"))[:-128]:
        if EVENT_NAME.fullmatch(old.name) and _inside(old, root):
            try:
                old.unlink()
            except FileNotFoundError:
                pass
    return path


def consume_events(root, sid):
    root = Path(root).resolve()
    folder = root / str(uuid.UUID(sid))
    if not folder.is_dir() or not _inside(folder, root):
        return []
    files = []
    for index, path in enumerate(folder.iterdir()):
        if index >= 256:
            break
        if EVENT_NAME.fullmatch(path.name) and _inside(path, root):
            files.append(path)
    events = []
    for path in sorted(files):
        try:
            with path.open("rb") as stream:
                raw = stream.read(65537)
            if len(raw) <= 65536:
                event = json.loads(raw)
                if (isinstance(event, dict) and event.get("session_id") == sid
                        and event.get("hook_event_name") in HOOK_NAMES):
                    events.append(event)
            path.unlink()
        except (OSError, ValueError):
            continue
    return events
