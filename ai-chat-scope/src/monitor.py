"""Independent source workers publish one latest immutable snapshot to Tk."""
from collections import Counter
from dataclasses import replace
import threading
import time
import re

from session_types import SessionSnapshot, to_gui_row
from terminal_tabs import terminal_positions


def _label(value, limit=200):
    if not isinstance(value, str):
        return ""
    value = value.encode("utf-8", "replace").decode("utf-8")
    return re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()[:limit]


def gui_rows(snapshots):
    rows = [to_gui_row(snapshot) for snapshot in snapshots]
    groups = {}
    for index, row in enumerate(rows):
        row["label"] = _label(row["label"])
        row["cwd"] = _label(row["cwd"], 32768)
        groups.setdefault((row["provider"], row["label"]), []).append(index)
    for indices in groups.values():
        if len(indices) < 2:
            continue
        width = 8
        maximum = max(len(rows[index]["id"]) for index in indices)
        while width < maximum and len({rows[index]["id"][-width:] for index in indices}) < len(indices):
            width += 4
        for index in indices:
            row = rows[index]
            row["label"] = "[%s] %s" % (row["id"][-width:], row["label"])
    return rows


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


def order_by_terminal(rows, positions):
    if not positions:
        return rows
    counts = Counter(row.terminal_tab for row in rows)
    window_slots = {}
    for index, row in enumerate(rows):
        tab = row.terminal_tab
        if tab in positions and counts[tab] == 1:
            window_slots.setdefault(tab[0], []).append(index)
    ordered = list(rows)
    for slots in window_slots.values():
        tabs = sorted((rows[index] for index in slots), key=lambda row: positions[row.terminal_tab])
        for index, row in zip(slots, tabs):
            ordered[index] = row
    return ordered


class Monitor:
    def __init__(self, sources, interval=1.0):
        self.sources = list(sources)
        self.interval = interval
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._source_values = {}
        self._terminal_positions = {}
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
                positions = None
                if getattr(source, "provider", None) == "Codex":
                    positions = terminal_positions(row.terminal_tab for row in rows if row.terminal_tab)
                with self._lock:
                    if positions is not None:
                        self._terminal_positions = positions
                    self._source_values[index] = (rows, diagnostics)
                    merged, messages = {}, set()
                    for values, notes in self._source_values.values():
                        messages.update(notes)
                        for row in values:
                            old = merged.get(row.key)
                            if old is None or row.started_at >= old.started_at:
                                merged[row.key] = row
                    rows = sorted(merged.values(), key=lambda value: (
                        value.started_at, value.provider, value.session_id))
                    self._latest = (order_by_terminal(rows, self._terminal_positions), tuple(sorted(messages)))
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
