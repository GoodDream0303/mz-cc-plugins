"""Own runtime data only. No writes into Claude/Codex source directories."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import time
import uuid
from urllib.parse import urlsplit

HOOK_NAMES = frozenset({"SessionStart", "SessionEnd", "PermissionRequest", "Stop", "Interrupt"})
EVENT_NAME = re.compile(r"\d{20}-[0-9a-f]{32}\.json\Z")


def runtime_root():
    override = os.environ.get("AI_CHAT_SCOPE_RUNTIME")
    return Path(override).absolute() if override else Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "ai-chat-scope"


def claude_home():
    return Path(os.environ.get('CLAUDE_CONFIG_DIR') or Path.home() / '.claude').absolute()


def codex_home_key(home):
    return hashlib.sha256(os.path.normcase(str(Path(home).resolve())).encode("utf-8")).hexdigest()[:16]


def home_events_root(root, home):
    return Path(root) / "runtime" / "codex" / codex_home_key(home)


def _inside(path, root):
    return (not path.is_symlink() and not (hasattr(path, "is_junction") and path.is_junction())
            and path.resolve().is_relative_to(root.resolve()))


def _plain_directory(path):
    """Keep the lexical boundary; inspect ancestors before walking through them."""
    path = Path(os.path.abspath(path))
    for component in reversed((path,) + tuple(path.parents)):
        try:
            info = component.lstat()
        except FileNotFoundError:
            continue
        if (stat.S_ISLNK(info.st_mode)
                or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)):
            raise ValueError("runtime path contains a reparse point")
    return path


def _remove_event_file(path, root):
    _plain_directory(path.parent)
    if not _inside(path, root):
        raise ValueError("event file escapes runtime root")
    path.unlink(missing_ok=True)


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
    root = _plain_directory(root)
    folder = root / sid
    _plain_directory(folder)
    if not _inside(folder, root):
        raise ValueError("event directory escapes runtime root")
    folder.mkdir(parents=True, exist_ok=True)
    _plain_directory(folder)
    path = folder / ("%020d-%s.json" % (stamp, uuid.uuid4().hex))
    temporary = path.with_suffix(".tmp")
    try:
        _plain_directory(folder)
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(clean, output, ensure_ascii=False)
            output.write("\n")
        _plain_directory(folder)
        temporary.replace(path)
    finally:
        _remove_event_file(temporary, root)
    for old in sorted(folder.glob("*.json"))[:-128]:
        if EVENT_NAME.fullmatch(old.name) and _inside(old, root):
            try:
                _remove_event_file(old, root)
            except FileNotFoundError:
                pass
    return path


def consume_events(root, sid):
    root = _plain_directory(root)
    folder = root / str(uuid.UUID(sid))
    _plain_directory(folder)
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
            _plain_directory(folder)
            with path.open("rb") as stream:
                raw = stream.read(65537)
            if len(raw) <= 65536:
                event = json.loads(raw)
                if (isinstance(event, dict) and event.get("session_id") == sid
                        and event.get("hook_event_name") in HOOK_NAMES):
                    events.append(event)
            _remove_event_file(path, root)
        except (OSError, ValueError):
            continue
    return events


def _config_data(path):
    try:
        with Path(path).open("r", encoding="utf-8-sig") as source:
            raw = source.read(65537)
        value = json.loads(raw) if len(raw) <= 65536 else {}
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, UnicodeError):
        return {}


def _window_fields(data):
    def number(key, default, low, high):
        value = data.get(key, default)
        if type(value) is int:
            return min(high, max(low, value))
        if type(value) is not float or not math.isfinite(value):
            value = default
        return min(high, max(low, value))
    result = {"x": int(number("x", 80, -1000000, 1000000)),
              "y": int(number("y", 80, -1000000, 1000000)),
              "width": int(number("width", 340, 160, 2000)),
              "scale": number("scale", 1.0, .6, 3.0),
              "opacity": number("opacity", .92, .2, 1.0),
              "pinned": data.get("pinned") if type(data.get("pinned")) is bool else True}
    live = data.get("codex")
    if isinstance(live, dict):
        endpoint, token_file = live.get("endpoint"), live.get("token_file")
        if (isinstance(endpoint, str) and 0 < len(endpoint) <= 256
                and isinstance(token_file, str) and 0 < len(token_file) <= 32768):
            try:
                url = urlsplit(endpoint)
                valid = (url.scheme == "ws" and url.hostname == "127.0.0.1" and url.port
                         and url.username is None and url.password is None
                         and not url.query and not url.fragment and url.path in ("", "/"))
            except ValueError:
                valid = False
            if valid:
                result["codex"] = {"endpoint": endpoint, "token_file": token_file}
    return result


def load_window_config(new_path, legacy_path):
    new_path = Path(new_path)
    if new_path.exists():
        return _window_fields(_config_data(new_path))
    legacy = _config_data(legacy_path)
    legacy.pop("codex", None)
    if "width" not in legacy and "base_w" in legacy:
        legacy["width"] = legacy["base_w"]
    return _window_fields(legacy)


def save_window_config(path, config):
    path = Path(path)
    previous = _config_data(path)
    previous.update(config)
    clean = _window_fields(previous)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name("." + path.name + "-" + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(clean, output, ensure_ascii=False, allow_nan=False, indent=2)
            output.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
