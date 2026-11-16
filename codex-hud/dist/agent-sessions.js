import { SessionReader } from './reader.js';
import { listSessions, readSessionHints } from './sessions.js';
/** Parent activity is primary; verified child lifecycle fills missing notifications. */
export class AgentSessionTracker {
    root;
    readers = new Map();
    nextDiscovery = 0;
    discoveryUnavailable = false;
    unresolved = false;
    snapshots = new Map();
    ambiguousUntil = new Map();
    constructor(root) {
        this.root = root;
    }
    get files() { return [...this.readers.values()].map(reader => reader.file); }
    get needsDiscovery() { return this.unresolved; }
    async refresh(snapshot, parent, options = {}) {
        for (const agent of snapshot.agents) {
            const timing = parent.agentTiming(agent.id);
            if (Number.isFinite(timing.startedAt))
                agent.startedAt = timing.startedAt;
            if (Number.isFinite(timing.endedAt))
                agent.endedAt = timing.endedAt;
        }
        const active = snapshot.agents.filter(a => /^[a-zA-Z0-9_-]{3,100}$/.test(a.id));
        const retained = new Set(snapshot.agents.map(a => a.id));
        for (const id of this.readers.keys())
            if (!retained.has(id)) {
                this.readers.delete(id);
                this.snapshots.delete(id);
            }
        for (const id of this.ambiguousUntil.keys())
            if (!retained.has(id))
                this.ambiguousUntil.delete(id);
        if (!active.length) {
            this.discoveryUnavailable = false;
            this.unresolved = false;
            return;
        }
        const missing = active.filter(a => !this.readers.has(a.id));
        if (missing.length) {
            const now = Date.now();
            let scan = now >= this.nextDiscovery;
            try {
                if (!scan && options.discover) {
                    const eligible = new Set(missing.filter(a => now >= (this.ambiguousUntil.get(a.id) ?? 0)).map(a => a.id));
                    if (eligible.size) {
                        const hints = await readSessionHints(this.root, options.files ?? []);
                        scan = hints.some(s => s.parentId === snapshot.sessionId && eligible.has(s.id));
                    }
                }
                if (scan) {
                    this.nextDiscovery = Date.now() + 5000;
                    const sessions = await listSessions(this.root);
                    this.discoveryUnavailable = false;
                    for (const agent of missing) {
                        const matches = sessions.filter(s => s.id === agent.id && s.parentId === snapshot.sessionId);
                        // Hints may reject unrelated work, but only a fresh full scan proves uniqueness.
                        if (matches.length === 1) {
                            this.readers.set(agent.id, new SessionReader(matches[0].path, agent.id));
                            this.ambiguousUntil.delete(agent.id);
                        }
                        else if (matches.length > 1)
                            this.ambiguousUntil.set(agent.id, this.nextDiscovery);
                        else
                            this.ambiguousUntil.delete(agent.id);
                    }
                }
            }
            catch {
                this.discoveryUnavailable = true;
            }
        }
        this.unresolved = active.some(a => !this.readers.has(a.id));
        if (this.discoveryUnavailable)
            snapshot.errors.push('Agent lifecycle lookup unavailable; showing parent-reported status');
        for (const agent of active) {
            const reader = this.readers.get(agent.id);
            if (!reader)
                continue;
            options.onFile?.(reader.file);
            let child = this.snapshots.get(agent.id);
            if (options.invalidate !== false || !child) {
                try {
                    child = await reader.read();
                    this.snapshots.set(agent.id, child);
                }
                catch {
                    continue;
                }
            }
            if (child.sessionId !== agent.id || child.parentId !== snapshot.sessionId)
                continue;
            const pending = ['starting', 'running', 'interrupted'].includes(agent.status), at = Date.parse(child.activityAt ?? '');
            const taskStart = parent.agentTiming(agent.id).startedAt ?? (pending ? parent.agentActivityAt(agent.id) : undefined) ?? -Infinity;
            if (!Number.isFinite(at) || at < taskStart)
                continue;
            const oldInterrupted = agent.status === 'interrupted' && at < (parent.agentActivityAt(agent.id) ?? -Infinity);
            if (child.model)
                agent.model = child.model;
            if (child.totals && Number.isFinite(child.totals.total))
                agent.totalTokens = child.totals.total;
            if (Number.isFinite(child.turnStartedAt) && (pending || !Number.isFinite(agent.endedAt) || child.turnStartedAt <= agent.endedAt)) {
                agent.startedAt = child.turnStartedAt;
                if (!oldInterrupted) {
                    if (Number.isFinite(child.turnEndedAt))
                        agent.endedAt = child.turnEndedAt;
                    else if (pending)
                        delete agent.endedAt;
                }
            }
            if (!pending || oldInterrupted) {
                delete agent.action;
                continue;
            }
            const status = { working: 'running', idle: 'done', interrupted: 'interrupted' }[child.status];
            if (status) {
                agent.status = status;
                if (status === 'running')
                    agent.action = child.todos.find(t => t.status === 'in_progress')?.step ?? child.tools.filter(t => t.status === 'running').at(-1)?.name;
                else
                    delete agent.action;
            }
        }
    }
}
