"""Temporary Codex signal probe; never retain prompts, arguments or responses.

This records protocol shapes, not approval decisions. A tool-completed hook
cannot establish when a person finished an approval dialog.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import shlex
import sys
import time
import uuid


MAX_INPUT = 1048576
HOOK_EVENTS = frozenset({
    "SessionStart", "SessionEnd", "PermissionRequest", "PreToolUse",
    "PostToolUse", "Stop", "Interrupt",
})
RECORD_TYPES = frozenset({"session_meta", "event_msg", "response_item", "turn_context"})
EVENT_TYPES = frozenset({
    "task_started", "task_complete", "turn_aborted", "item_started", "item_completed",
    "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output",
    "exec_command_begin", "exec_command_end", "exec_approval_request",
    "request_user_input", "message", "token_count", "thread_settings_applied",
})
SAFE_TOKEN = re.compile(r"[A-Za-z0-9_:.\-]{1,160}\Z")


def _optional_token(target, key, value):
    if isinstance(value, str) and SAFE_TOKEN.fullmatch(value):
        target[key] = value


def read_hook(stream):
    raw = stream.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("input limit exceeded")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("object required")
    return value


def sanitize_hook(payload: dict, observed_ns: int) -> dict:
    session_id = str(uuid.UUID(payload["session_id"]))
    name = payload.get("hook_event_name")
    if name not in HOOK_EVENTS or not isinstance(observed_ns, int) or observed_ns < 0:
        raise ValueError("unsupported event")
    result = {"schema_version": 1, "source": "hook", "session_id": session_id,
              "hook_event_name": name, "observed_ns": observed_ns}
    for key in ("turn_id", "tool_use_id", "tool_name"):
        _optional_token(result, key, payload.get(key))
    return result


def sanitize_rollout(record: dict, observed_ns: int) -> dict:
    payload = record.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    result = {"schema_version": 1, "source": "rollout", "observed_ns": observed_ns}
    kind = record.get("type")
    result["record_type"] = kind if kind in RECORD_TYPES else "other"
    event = payload.get("type")
    if event in EVENT_TYPES:
        result["event_type"] = event
    for target, source in (("tool_name", "name"), ("tool_use_id", "call_id"),
                           ("turn_id", "turn_id")):
        _optional_token(result, target, payload.get(source))
    return result


def summarize_records(records: list) -> dict:
    hooks = Counter(record["hook_event_name"] for record in records
                    if record.get("source") == "hook" and record.get("hook_event_name") in HOOK_EVENTS)
    events = Counter(record["event_type"] for record in records
                     if record.get("source") == "rollout" and record.get("event_type") in EVENT_TYPES)
    return {
        "record_count": len(records), "hook_event_counts": dict(hooks),
        "rollout_event_counts": dict(events), "approval_resume_proven": False,
        "verification": "Metadata only; approval resolution requires a correlated runtime observation.",
    }


def _powershell_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def prepare_probe(root: Path):
    root = root.resolve()
    config_dir = root / ".codex"
    if not config_dir.resolve().is_relative_to(root):
        raise ValueError("configuration directory escapes probe root")
    hook_path = config_dir / "hooks.json"
    if hook_path.exists():
        raise FileExistsError("project hook configuration already exists")
    script = Path(__file__).resolve()
    arguments = [sys.executable, "-B", str(script), "--hook", "--root", str(root)]
    windows_command = "& " + " ".join(_powershell_quote(value) for value in arguments)
    command = windows_command if sys.platform == "win32" else shlex.join(arguments)
    handler = {"type": "command", "command": command,
               "commandWindows": windows_command, "timeout": 5}
    config = {"hooks": {name: [{"hooks": [handler]}] for name in sorted(HOOK_EVENTS)}}
    config_dir.mkdir(parents=True, exist_ok=True)
    with hook_path.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(config, output, ensure_ascii=False, indent=2)
        output.write("\n")
    return hook_path


def publish(root, event):
    directory = root.resolve() / "probe-events"
    if not directory.resolve().is_relative_to(root.resolve()):
        raise ValueError("event directory escapes probe root")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (str(time.monotonic_ns()) + "-" + uuid.uuid4().hex + ".json")
    temporary = path.with_suffix(".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(event, output, ensure_ascii=False)
            output.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", type=Path, metavar="TEST_DIRECTORY")
    mode.add_argument("--hook", action="store_true")
    mode.add_argument("--report", action="store_true")
    mode.add_argument("--capture-rollout", type=Path)
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()
    if args.hook:
        try:
            event = sanitize_hook(read_hook(sys.stdin.buffer), time.monotonic_ns())
            if args.root is not None:
                publish(args.root, event)
        except Exception:
            pass  # Never turn a diagnostic hook into a CLI failure or echo raw input.
        print("{}")
        return 0
    if args.prepare is not None:
        print(prepare_probe(args.prepare))
        return 0
    if args.root is None:
        parser.error("--root is required for report or capture")
    if args.capture_rollout is not None:
        # Diagnostic capture only: the product reader will be incremental.
        with args.capture_rollout.open("rb") as stream:
            while True:
                line = stream.readline(MAX_INPUT + 1)
                if not line:
                    break
                oversized = len(line) > MAX_INPUT
                while not line.endswith(b"\n"):
                    line = stream.readline(MAX_INPUT + 1)
                    if not line:
                        break
                    oversized = True
                if oversized:
                    continue
                try:
                    record = json.loads(line)
                    if isinstance(record, dict):
                        publish(args.root, sanitize_rollout(record, time.monotonic_ns()))
                except (ValueError, TypeError):
                    continue
        return 0
    records = []
    for count, path in enumerate((args.root / "probe-events").glob("*.json")):
        if count >= 4096:
            break
        try:
            with path.open("rb") as stream:
                record = read_hook(stream)
            records.append(record)
        except (OSError, ValueError):
            continue
    print(json.dumps(summarize_records(records), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
