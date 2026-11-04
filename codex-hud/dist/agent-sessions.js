import { SessionReader } from './reader.js';
import { listSessions } from './sessions.js';
/** Parent activity is primary; verified child lifecycle fills missing notifications. */
export class AgentSessionTracker {
    root;
    readers = new Map();
    nextDiscovery = 0;
    discoveryUnavailable = false;
    constructor(root) {
        this.root = root;
    }
    async refresh(snapshot, parent) {
        const active = snapshot.agents.filter(a => ['starting', 'running', 'interrupted'].includes(a.status) && /^[a-zA-Z0-9_-]{3,100}$/.test(a.id));
        const retained = new Set(snapshot.agents.map(a => a.id));
        for (const id of this.readers.keys())
            if (!retained.has(id))
                this.readers.delete(id);
        if (!active.length) {
            this.discoveryUnavailable = false;
            return;
        }
        if (active.some(a => !this.readers.has(a.id)) && Date.now() >= this.nextDiscovery) {
            this.nextDiscovery = Date.now() + 5000;
            let sessions = [];
            try {
                sessions = await listSessions(this.root);
                this.discoveryUnavailable = false;
            }
            catch {
                this.discoveryUnavailable = true;
            }
            for (const agent of active) {
                if (this.readers.has(agent.id))
                    continue;
                const matches = sessions.filter(s => s.id === agent.id && s.parentId === snapshot.sessionId);
                if (matches.length === 1)
                    this.readers.set(agent.id, new SessionReader(matches[0].path, agent.id));
            }
        }
        if (this.discoveryUnavailable)
            snapshot.errors.push('Agent lifecycle lookup unavailable; showing parent-reported status');
        for (const agent of active) {
            const reader = this.readers.get(agent.id);
            if (!reader)
                continue;
            let child;
            try {
                child = await reader.read();
            }
            catch {
                continue;
            }
            if (child.sessionId !== agent.id || child.parentId !== snapshot.sessionId)
                continue;
            const at = Date.parse(child.activityAt ?? '');
            if (!Number.isFinite(at) || at < (parent.agentActivityAt(agent.id) ?? -Infinity))
                continue;
            const status = { working: 'running', idle: 'done', interrupted: 'interrupted' }[child.status];
            if (status) {
                agent.status = status;
                if (child.model)
                    agent.model = child.model;
            }
        }
    }
}
