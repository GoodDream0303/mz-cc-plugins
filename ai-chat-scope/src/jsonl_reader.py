"""Bounded append reader. Fingerprints retain hashes, never conversation text."""
import hashlib
import json
from pathlib import Path


class JsonlReader:
    def __init__(self, path, max_line_bytes=2097152):
        self.path = Path(path)
        self.max_line_bytes = max_line_bytes
        self.offset = 0
        self.generation = 0
        self.caught_up = False
        self._identity = None
        self._mtime = None
        self._size = None
        self._carry = b""
        self._discard = False
        self._anchors = []

    @staticmethod
    def _digest(stream, start, length):
        stream.seek(start)
        return hashlib.sha256(stream.read(length)).digest()

    def _reset(self):
        self.offset = 0
        self.generation += 1
        self._carry = b""
        self._discard = False
        self._anchors = []

    def read(self, max_bytes=262144):
        """Read max_bytes new bytes; hash validation/sampling adds at most 16 KiB."""
        if max_bytes <= 0:
            return []
        with self.path.open("rb") as stream:
            stat = stream.fileno()
            import os
            info = os.fstat(stat)
            # Windows fstat ctime can change on append; it is not a file identity.
            identity = (info.st_dev, info.st_ino, getattr(info, "st_birthtime_ns", 0))
            changed = (self._identity is not None and (
                identity != self._identity or info.st_size < self.offset
                or (info.st_size == self._size and info.st_mtime_ns != self._mtime)
            ))
            if not changed:
                changed = any(self._digest(stream, start, size) != digest
                              for start, size, digest in self._anchors)
            if changed:
                self._reset()
            self._identity, self._mtime, self._size = identity, info.st_mtime_ns, info.st_size
            stream.seek(self.offset)
            chunk = stream.read(min(max_bytes, max(0, info.st_size - self.offset)))
            self.offset += len(chunk)
            parts = (self._carry + chunk).split(b"\n")
            self._carry = parts.pop()
            result = []
            for line in parts:
                if self._discard:
                    self._discard = False
                    continue
                if len(line) > self.max_line_bytes:
                    continue
                try:
                    value = json.loads(line)
                except (ValueError, UnicodeError):
                    continue
                if isinstance(value, dict):
                    result.append(value)
            if len(self._carry) > self.max_line_bytes:
                self._carry = b""
                self._discard = True
            size = min(4096, self.offset)
            self._anchors = [(0, size, self._digest(stream, 0, size)),
                             (self.offset - size, size, self._digest(stream, self.offset - size, size))] if size else []
            self.caught_up = self.offset >= info.st_size and not self._carry and not self._discard
            return result
