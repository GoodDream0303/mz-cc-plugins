"""Temporary, authenticated loopback observer. Never submits turns or approvals."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import secrets
import socket
import struct
import time
from urllib.parse import urlsplit


MAX_FRAME = 2097152
READ_METHODS = frozenset({"initialize", "thread/loaded/list", "thread/read"})
WAIT_FLAGS = frozenset({"waitingOnApproval", "waitingOnUserInput"})


def _exact(stream, count):
    result = bytearray()
    while len(result) < count:
        chunk = stream.read(count - len(result))
        if not chunk:
            raise ConnectionError("connection ended")
        result.extend(chunk)
    return bytes(result)


def encode_frame(payload: bytes, opcode=1) -> bytes:
    if len(payload) > MAX_FRAME:
        raise ValueError("frame limit exceeded")
    length = len(payload)
    header = bytes([0x80 | opcode])
    if length < 126:
        header += bytes([0x80 | length])
    elif length < 65536:
        header += b"\xfe" + struct.pack("!H", length)
    else:
        header += b"\xff" + struct.pack("!Q", length)
    mask = secrets.token_bytes(4)
    return header + mask + bytes(value ^ mask[i % 4] for i, value in enumerate(payload))


def read_frame(stream):
    first, second = _exact(stream, 2)
    if first & 0x70 or second & 0x80:
        raise ValueError("unsupported server frame")
    length = second & 0x7f
    if length == 126:
        length = struct.unpack("!H", _exact(stream, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _exact(stream, 8))[0]
    if length > MAX_FRAME:
        raise ValueError("frame limit exceeded")
    opcode = first & 0x0f
    if opcode >= 8 and (length > 125 or not first & 0x80):
        raise ValueError("invalid control frame")
    return bool(first & 0x80), opcode, _exact(stream, length)


class LocalWebSocket:
    def __init__(self, endpoint, token):
        url = urlsplit(endpoint)
        if (url.scheme != "ws" or url.hostname != "127.0.0.1" or not url.port
                or url.username or url.password or url.query or url.fragment
                or url.path not in ("", "/")):
            raise ValueError("probe requires an explicit IPv4 loopback endpoint")
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
            raise ValueError("invalid local capability token")
        self.socket = socket.create_connection(("127.0.0.1", url.port), timeout=5)
        self.stream = self.socket.makefile("rb")
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        request = (
            "GET / HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n"
            "Authorization: Bearer %s\r\n\r\n" % (url.port, key, token)
        )
        try:
            self.socket.sendall(request.encode("ascii"))
            lines = []
            size = 0
            while True:
                line = self.stream.readline(16385 - size)
                size += len(line)
                if not line or size > 16384:
                    raise ConnectionError("invalid websocket handshake")
                if line == b"\r\n":
                    break
                lines.append(line)
            if not lines or lines[0].split()[1:2] != [b"101"]:
                raise ConnectionError("websocket upgrade rejected")
            headers = {}
            for line in lines[1:]:
                name, _, value = line.partition(b":")
                headers[name.strip().lower()] = value.strip()
            expected = base64.b64encode(hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
            ).digest())
            if headers.get(b"sec-websocket-accept") != expected:
                raise ConnectionError("websocket handshake mismatch")
        except Exception:
            self.close()
            raise

    def send_json(self, value):
        self.socket.sendall(encode_frame(json.dumps(value).encode("utf-8")))

    def recv_json(self):
        content = bytearray()
        begun = False
        while True:
            final, opcode, payload = read_frame(self.stream)
            if opcode == 8:
                raise ConnectionError("peer closed")
            if opcode == 9:
                self.socket.sendall(encode_frame(payload, 10))
                continue
            if opcode == 10:
                continue
            if (opcode == 1 and begun) or (opcode == 0 and not begun) or opcode not in (0, 1):
                raise ValueError("unsupported websocket message")
            begun = True
            content.extend(payload)
            if len(content) > MAX_FRAME:
                raise ValueError("message limit exceeded")
            if final:
                result = json.loads(content)
                if not isinstance(result, dict):
                    raise ValueError("JSON object required")
                return result

    def close(self):
        self.stream.close()
        self.socket.close()


def sanitize_thread(thread: dict, observed_ns: int) -> dict:
    sid = thread.get("id")
    if not isinstance(sid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", sid):
        raise ValueError("invalid thread identity")
    status = thread.get("status") or {}
    native = status.get("type")
    raw_flags = status.get("activeFlags") or []
    flags = sorted(value for value in raw_flags if value in WAIT_FLAGS)
    if native == "active" and flags:
        state = "attn"
    elif native == "active" and not raw_flags:
        state = "run"
    elif native == "idle":
        state = "stby"
    else:
        state = "unavailable"
    return {"thread_id": sid, "native_type": native if native in (
        "active", "idle", "systemError", "notLoaded") else "unknown",
        "active_flags": flags, "state": state, "observed_ns": observed_ns}


class Observer:
    def __init__(self, transport):
        self.transport = transport
        self.next_id = 0

    def rpc(self, method, params):
        if method not in READ_METHODS:
            raise ValueError("read-only observer forbids this method")
        self.next_id += 1
        request_id = self.next_id
        self.transport.send_json({"method": method, "id": request_id, "params": params})
        for _ in range(256):
            message = self.transport.recv_json()
            if "method" in message or message.get("id") != request_id:
                continue  # Never answer a server-side approval/question, even if received.
            if "error" in message:
                raise RuntimeError("read-only RPC failed")
            return message.get("result") or {}
        raise RuntimeError("too many unrelated protocol messages")

    def initialize(self):
        self.rpc("initialize", {"clientInfo": {"name": "ai_chat_scope_probe", "version": "0.0.0"}})
        self.transport.send_json({"method": "initialized", "params": {}})

    def poll(self):
        listed = self.rpc("thread/loaded/list", {"limit": 100})
        if listed.get("nextCursor"):
            raise RuntimeError("probe supports at most one page of loaded threads")
        snapshots = []
        for sid in listed.get("data", []):
            result = self.rpc("thread/read", {"threadId": sid, "includeTurns": False})
            snapshots.append(sanitize_thread(result.get("thread") or {}, time.monotonic_ns()))
        return sorted(snapshots, key=lambda value: value["thread_id"])


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
        # Protocol responses can carry private text; diagnostics contain only the error class.
        print(json.dumps({"probe_error": type(error).__name__}), flush=True)
        raise SystemExit(1)
