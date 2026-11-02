"""Independent source workers publish one latest immutable snapshot to Tk."""
from dataclasses import replace
import threading
import time

from session_types import SessionSnapshot


def row_signature(rows, diagnostics=()):
    fields = ("provider", "id", "pid", "cwd", "label", "state", "state_detail",
              "started", "freshness", "capabilities", "kind", "job_id", "bg_info")
    return tuple(tuple(row.get(key) for key in fields) for row in rows), tuple(diagnostics)


def row_action(row):
    pid = row.get("pid")
    if (row.get("provider") == "claude" and "close" in row.get("capabilities", ())
            and type(pid) is int and pid > 0):
        return "close"
    if row.get("provider") == "codex" and "copy_id" in row.get("capabilities", ()):
        return "copy_id"
    return None


class Monitor:
    def __init__(self, sources, interval=1.0):
        self.sources = list(sources)
        self.interval = interval
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._source_values = {}
        self._latest = None
        self._threads = []

    def start(self):
        if self._threads:
            return
        for index, source in enumerate(self.sources):
            worker = threading.Thread(target=self._worker, args=(index, source), daemon=True)
            self._threads.append(worker)
            worker.start()

    def _worker(self, index, source):
        previous = []
        try:
            while not self._stop.is_set():
                started = time.monotonic()
                try:
                    rows = list(source.poll())
                    if not all(isinstance(row, SessionSnapshot) for row in rows):
                        raise ValueError("invalid provider snapshot")
                    diagnostics = tuple(source.diagnostics)
                    previous = rows
                except Exception:
                    rows = [replace(row, freshness="stale") for row in previous]
                    provider = getattr(source, "provider", "来源")
                    diagnostics = (provider + "：状态暂不可用",)
                with self._lock:
                    self._source_values[index] = (rows, diagnostics)
                    merged, messages = {}, set()
                    for values, notes in self._source_values.values():
                        messages.update(notes)
                        for row in values:
                            old = merged.get(row.key)
                            if old is None or row.started_at >= old.started_at:
                                merged[row.key] = row
                    self._latest = (sorted(merged.values(), key=lambda value: (
                        value.started_at, value.provider, value.session_id)), tuple(sorted(messages)))
                self._stop.wait(max(.01, self.interval - (time.monotonic() - started)))
        finally:
            if hasattr(source, "close"):
                try:
                    source.close()
                except Exception:
                    pass

    def latest(self):
        with self._lock:
            value, self._latest = self._latest, None
        return value

    def stop(self):
        self._stop.set()


def create_sources(config):
    from claude_source import ClaudeSource
    from codex_source import CodexSource
    from codex_live import CodexLiveClient
    live_config = config.get("codex") or {}
    live = None
    if live_config.get("endpoint") and live_config.get("token_file"):
        live = CodexLiveClient(live_config["endpoint"], live_config["token_file"])
    return [ClaudeSource(), CodexSource(live=live)]
