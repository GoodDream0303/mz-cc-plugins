"""A passive, non-blocking Codex plugin hook. Output never changes decisions."""
import json
import os
from pathlib import Path
import sys
import time
import uuid

from runtime_paths import runtime_root, home_events_root, publish_event, HOOK_NAMES


def hook_main(stdin, stdout, root):
    try:
        raw = stdin.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("hook input limit")
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get("hook_event_name") not in HOOK_NAMES:
            raise ValueError("unsupported event")
        event = {key: payload[key] for key in (
            "session_id", "hook_event_name", "turn_id", "tool_use_id", "tool_name") if key in payload}
        event["session_id"] = str(uuid.UUID(event["session_id"]))
        event["observed_ns"] = time.monotonic_ns()
        home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
        publish_event(home_events_root(root, home), event)
    except Exception:
        pass
    stdout.write("{}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(hook_main(sys.stdin.buffer, sys.stdout, runtime_root()))
