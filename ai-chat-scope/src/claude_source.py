"""Claude file source, extracted from the existing monitor without GUI imports."""
import os
import re
import json
import math
from pathlib import Path
from session_types import SessionSnapshot


def _identifier(value):
    return isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,160}', value) is not None


def _valid_session(data):
    if not isinstance(data, dict) or type(data.get('pid')) is not int or not 0 < data['pid'] < 2**32:
        return False
    for key in ('sessionId', 'jobId', 'parkedJobId'):
        value = data.get(key)
        if value not in (None, '') and not _identifier(value):
            return False
    for key in ('cwd', 'name', 'nameSource', 'status', 'kind'):
        if data.get(key) is not None and not isinstance(data[key], str):
            return False
    started = data.get('startedAt')
    if started is not None:
        if type(started) not in (int, float) or not 0 <= started <= 10**12:
            return False
        if type(started) is float and not math.isfinite(started):
            return False
    return data.get('spare') is None or type(data['spare']) is bool


def registry_matches(directory, pid, session_id):
    """Validate the selected identity immediately before a close operation."""
    if type(pid) is not int or not 0 < pid < 2**32 or not _identifier(session_id):
        return False
    try:
        with (Path(directory) / (str(pid) + '.json')).open('r', encoding='utf-8-sig') as source:
            raw = source.read(65537)
        if len(raw) > 65536:
            return False
        current = json.loads(raw)
        return (isinstance(current, dict) and type(current.get('pid')) is int
                and current['pid'] == pid and current.get('sessionId') == session_id)
    except (OSError, ValueError, UnicodeError):
        return False

def _enc_cwd(cwd):
    return re.sub('[^A-Za-z0-9]', '-', cwd or '')

def _is_converted_interactive(bg_info):
    """判断一个 bg 会话是否为「转换态交互会话」(左键切走的),而非纯后台任务。
    判据:bgIsolation 字段存在 或 respawnFlags 含 --reply-on-resume。
    """
    if not isinstance(bg_info, dict) or not bg_info:
        return False
    if 'bgIsolation' in bg_info:
        return True
    flags = bg_info.get('respawnFlags', [])
    return isinstance(flags, list) and '--reply-on-resume' in flags

def segs_of(cwd):
    return [x for x in (cwd or '').replace('\\', '/').rstrip('/').split('/') if x and (not x.endswith(':'))]

def assign_labels(items):
    MAXD = 2
    segs = [segs_of(s['cwd']) for s in items]
    depth = [1] * len(items)

    def make(i):
        seg = segs[i]
        if not seg:
            return 'pid:%d' % items[i]['pid']
        return '/'.join(seg[max(0, len(seg) - depth[i]):])
    for _ in range(MAXD):
        labels = [make(i) for i in range(len(items))]
        groups = {}
        for i, l in enumerate(labels):
            groups.setdefault(l, []).append(i)
        any_ext = False
        for ids in groups.values():
            if len(ids) < 2 or len({items[i]['cwd'] for i in ids}) < 2:
                continue
            for i in ids:
                if depth[i] < min(len(segs[i]), MAXD):
                    depth[i] += 1
                    any_ext = True
        if not any_ext:
            break
    labels = [make(i) for i in range(len(items))]
    cnt = {}
    for l in labels:
        cnt[l] = cnt.get(l, 0) + 1
    for i, s in enumerate(items):
        s['label'] = labels[i] + (' #%d' % s['pid'] if cnt[labels[i]] > 1 else '')

class ClaudeSource:
    provider = "Claude"
    def __init__(self, home=None):
        self.home = Path(home) if home is not None else Path.home() / ".claude"
        self.sessions_dir = str(self.home / "sessions")
        self.projects_dir = str(self.home / "projects")
        self.jobs_dir = str(self.home / "jobs")
        self._title_cache = {}
        self._session_cache = {}
        self._killed = set()
        self.diagnostics = ()
        self._bad_registry = set()
        self._bad_jobs = False

    def mark_closed(self, pid, session_id):
        self._killed.add((pid, session_id))

    def poll(self):
        self.diagnostics = () if Path(self.sessions_dir).is_dir() else ("Claude：未找到会话目录",)
        self._bad_registry = set()
        self._bad_jobs = False
        result = []
        for row in self.read_sessions():
            pid = row.get("pid")
            valid_pid = isinstance(pid, int) and not isinstance(pid, bool) and pid > 0
            started = row.get("started", 0)
            started = float(started) if isinstance(started, (int, float)) else 0.0
            result.append(SessionSnapshot(
                provider="claude", session_id=row["id"], cwd=row["cwd"],
                title=row["label"], state=row["state"], started_at=started,
                state_detail={"attn":"等待授权或回答", "bg":"后台会话", "run":"执行中", "stby":"待机"}[row["state"]],
                pid=pid if valid_pid else None,
                capabilities=("close",) if valid_pid and row.get('verified_id') else (),
                freshness='stale' if str(pid) + '.json' in self._bad_registry else 'fresh',
                kind=row.get("kind"), job_id=row.get("job_id"), bg_info=row.get("bg_info")))
        if self._bad_registry:
            self.diagnostics += ("Claude：部分会话信息暂不可读",)
        if self._bad_jobs:
            self.diagnostics += ("Claude：部分后台信息暂不可读",)
        return result

    def fallback_title(self, sid, cwd):
        path = os.path.join(self.projects_dir, _enc_cwd(cwd), sid + '.jsonl')
        if not os.path.exists(path):
            try:
                path = next((p for d in os.listdir(self.projects_dir) for p in [os.path.join(self.projects_dir, d, sid + '.jsonl')] if os.path.exists(p)), None)
            except OSError:
                path = None
        if not path:
            return None
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            return None
        c = self._title_cache.get(sid)
        if c and c[0] == path and (c[1] == mtime):
            return c[2]
        ai_title = last_prompt = None
        try:
            with open(path, 'rb') as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(0, size - 65536))
                lines = f.read().decode('utf-8', 'replace').split('\n')
            for l in reversed(lines):
                if not l:
                    continue
                if '"ai-title"' not in l and (last_prompt is not None or '"last-prompt"' not in l):
                    continue
                try:
                    o = json.loads(l)
                except ValueError:
                    continue
                if not isinstance(o, dict):
                    continue
                if o.get('type') == 'ai-title' and isinstance(o.get('aiTitle'), str) and o['aiTitle'].strip():
                    ai_title = o['aiTitle'].strip()
                    break
                if last_prompt is None and o.get('type') == 'last-prompt' and isinstance(o.get('lastPrompt'), str) and o['lastPrompt'].strip():
                    last_prompt = ' '.join(o['lastPrompt'].split())
        except OSError:
            pass
        title = ai_title or last_prompt
        self._title_cache[sid] = (path, mtime, title)
        return title

    def read_bg_jobs(self):
        """
        返回 dict: sessionId -> {"name": ..., "state": ..., "tempo": ...}
        """
        jobs = {}
        try:
            job_ids = os.listdir(self.jobs_dir)
        except OSError:
            return jobs
        for jid in job_ids:
            if jid == 'pins.json':
                continue
            state_file = os.path.join(self.jobs_dir, jid, 'state.json')
            if not os.path.exists(state_file):
                continue
            try:
                with open(state_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if not isinstance(data, dict):
                    self._bad_jobs = True
                    continue
                sid = data.get('sessionId')
                if not _identifier(sid):
                    self._bad_jobs = True
                    continue
                state = data.get('state', '')
                tempo = data.get('tempo', '')
                name = data.get('name', '')
                if state in ('working', 'pending', 'starting') and tempo not in ('idle', 'done'):
                    jobs[sid] = {'name': name[:200] if isinstance(name, str) else '',
                                 'state': state, 'tempo': tempo[:32] if isinstance(tempo, str) else ''}
            except (OSError, ValueError):
                pass
        return jobs

    def read_sessions(self):
        bg_jobs = self.read_bg_jobs()
        out = []
        present = set()
        try:
            files = os.listdir(self.sessions_dir)
        except OSError:
            return out
        entries = []
        for fn in files:
            if not fn.endswith('.json'):
                continue
            try:
                with open(os.path.join(self.sessions_dir, fn), 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if not _valid_session(data):
                    raise ValueError('invalid registry shape')
                self._session_cache[fn] = data
            except (OSError, ValueError):
                self._bad_registry.add(fn)
                data = self._session_cache.get(fn)
                if data is None:
                    continue
            entries.append((fn, data))
        bg_job_ids = {d.get('jobId') for _, d in entries if d.get('kind') == 'bg' and (not d.get('spare'))}
        for fn, data in entries:
            if data.get('spare'):
                continue
            if data.get('parkedJobId') and data['parkedJobId'] in bg_job_ids:
                continue
            kind = data.get('kind')
            sid = data.get('sessionId') or fn[:-5]
            key = (data.get('pid') or 0, sid)
            present.add(key)
            if key in self._killed:
                continue
            status = data.get('status') or 'idle'
            bg_info = None
            if status == 'waiting':
                state = 'attn'
            elif kind == 'bg':
                job_id = data.get('jobId')
                full_bg_info = None
                if job_id:
                    try:
                        job_state_path = os.path.join(self.jobs_dir, job_id, 'state.json')
                        with open(job_state_path, 'r', encoding='utf-8') as jf:
                            full_bg_info = json.load(jf)
                        if not isinstance(full_bg_info, dict):
                            full_bg_info = None
                    except (OSError, ValueError):
                        pass
                if full_bg_info and _is_converted_interactive(full_bg_info):
                    state = 'stby' if status == 'idle' else 'run'
                else:
                    state = 'bg'
                    bg_info = bg_jobs.get(sid, {'name': data.get('name', ''), 'state': status, 'tempo': ''})
            elif status == 'idle':
                state = 'stby'
            else:
                state = 'run'
            out.append({'id': sid, 'pid': data.get('pid') or 0, 'cwd': data.get('cwd') or '', 'name': data.get('name') or '', 'name_src': data.get('nameSource'), 'state': state, 'bg_info': bg_info, 'kind': kind, 'job_id': data.get('jobId'), 'started': data.get('startedAt') or 0, 'label': '', 'verified_id': _identifier(data.get('sessionId'))})
        self._killed.intersection_update(present)
        assign_labels(out)
        for s in out:
            if s['name'] and s['name_src'] not in (None, 'derived', 'auto'):
                title = s['name']
            else:
                title = self.fallback_title(s['id'], s['cwd']) or s['name']
            if title:
                s['label'] = title
        out.sort(key=lambda s: (s['started'], s['pid']))
        seen = {}
        for s in out:
            sid = s['id']
            if sid not in seen or s['started'] >= seen[sid]['started']:
                seen[sid] = s
        out = list(seen.values())
        out.sort(key=lambda s: (s['started'], s['pid']))
        return out
