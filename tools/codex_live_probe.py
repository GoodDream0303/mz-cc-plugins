"""Development-only realtime probe; uses the same client as the product."""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai-chat-scope" / "src"))
from codex_live import LocalWebSocket, Observer, sanitize_thread, encode_frame, read_frame, READ_METHODS

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    token = args.token_file.read_text(encoding="ascii").strip()
    transport = LocalWebSocket(args.endpoint, token)
    previous = None
    try:
        observer = Observer(transport)
        observer.initialize()
        print(json.dumps({"observer_ready": True, "methods": sorted(READ_METHODS)}), flush=True)
        while True:
            started = time.perf_counter()
            snapshots = observer.poll()
            signature = [(value["thread_id"], value["native_type"], tuple(value["active_flags"])) for value in snapshots]
            if signature != previous:
                record = {"wall_time": datetime.now(timezone.utc).isoformat(),
                          "states": snapshots, "poll_ms": round((time.perf_counter() - started) * 1000, 3)}
                args.root.mkdir(parents=True, exist_ok=True)
                with (args.root / "observations.jsonl").open("a", encoding="utf-8", newline="\n") as output:
                    output.write(json.dumps(record) + "\n")
                print(json.dumps(record), flush=True)
                previous = signature
            if not args.watch:
                break
            time.sleep(.5)
    finally:
        transport.close()
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(json.dumps({"probe_error": type(error).__name__}), flush=True)
        raise SystemExit(1)
