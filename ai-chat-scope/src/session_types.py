"""Provider-neutral snapshots; session identity never depends on a PID."""
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SessionSnapshot:
    provider: str
    session_id: str
    cwd: str = ""
    title: str = ""
    state: str = "stby"
    state_detail: str = ""
    started_at: float = 0.0
    freshness: str = "fresh"
    capabilities: tuple = ()
    pid: Optional[int] = None
    kind: Optional[str] = None
    job_id: Optional[str] = None
    bg_info: Optional[dict] = None

    @property
    def key(self):
        return self.provider, self.session_id


def to_gui_row(snapshot):
    return {"provider": snapshot.provider, "id": snapshot.session_id,
            "pid": snapshot.pid, "cwd": snapshot.cwd, "label": snapshot.title,
            "name": snapshot.title, "state": snapshot.state,
            "state_detail": snapshot.state_detail, "started": snapshot.started_at,
            "freshness": snapshot.freshness, "capabilities": snapshot.capabilities,
            "kind": snapshot.kind, "job_id": snapshot.job_id, "bg_info": snapshot.bg_info}
