"""Authenticated, read-only observer of an already initialized CLI-only service."""
import base64
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
        self.rpc("initialize", {"clientInfo": {"name": "ai_chat_scope", "version": "2.0.0"}})
        self.transport.send_json({"method": "initialized", "params": {}})

    def read_threads(self):
        listed = self.rpc("thread/loaded/list", {"limit": 100})
        if listed.get("nextCursor"):
            raise RuntimeError("probe supports at most one page of loaded threads")
        threads = []
        for sid in listed.get("data", []):
            result = self.rpc("thread/read", {"threadId": sid, "includeTurns": False})
            thread = result.get("thread") or {}
            if thread.get("id") != sid:
                raise ValueError("thread identity mismatch")
            threads.append(thread)
        return threads

    def poll(self):
        snapshots = [sanitize_thread(thread, time.monotonic_ns()) for thread in self.read_threads()]
        return sorted(snapshots, key=lambda value: value["thread_id"])


class CodexLiveClient:
    """Only connect to an explicit endpoint after its owner CLI initialized it.

    This class never launches a server, subscribes, resumes a thread or sends
    an approval response. Credentials are read from a file and never cached.
    """
    def __init__(self, endpoint, token_file, transport_factory=LocalWebSocket):
        self.endpoint = endpoint
        self.token_file = Path(token_file)
        self.transport_factory = transport_factory
        self.available = False
        self.diagnostics = ()
        self.rows = {}
        self._transport = None
        self._observer = None
        self._retry_at = 0

    def close(self):
        if self._transport is not None:
            try:
                self._transport.close()
            except (OSError, ValueError):
                pass
        self._transport = self._observer = None

    def poll(self):
        if time.monotonic() < self._retry_at:
            return self.rows
        try:
            if self._observer is None:
                with self.token_file.open("r", encoding="ascii") as source:
                    token = source.read(513).strip()
                if len(token) > 256:
                    raise ValueError("capability token size limit")
                self._transport = self.transport_factory(self.endpoint, token)
                self._observer = Observer(self._transport)
                self._observer.initialize()
            rows = {}
            for thread in self._observer.read_threads():
                if thread.get("threadSource") != "user" or thread.get("parentThreadId") is not None:
                    continue
                snapshot = sanitize_thread(thread, time.monotonic_ns())
                sid = snapshot["thread_id"]
                rows[sid] = {
                    "state": snapshot["state"], "state_detail": (
                        "等待授权" if "waitingOnApproval" in snapshot["active_flags"] else
                        "等待回答" if "waitingOnUserInput" in snapshot["active_flags"] else
                        "执行中" if snapshot["state"] == "run" else "待机"),
                    "path": thread.get("path"), "cwd": thread.get("cwd"),
                    "name": thread.get("name"), "created_at": thread.get("createdAt"),
                }
            self.rows = rows
            self.available = True
            self.diagnostics = ()
        except Exception:
            self.close()
            self.available = False
            self._retry_at = time.monotonic() + 5
            self.diagnostics = ("Codex：实时状态暂不可用",)
        return self.rows
