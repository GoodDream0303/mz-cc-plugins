const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.length > 0 ? value.slice(0, 200) : undefined;
export function agentStatus(value) {
    const key = typeof value === 'string' ? value : object(value) ? Object.keys(value)[0] : undefined;
    return { pending_init: 'starting', starting: 'starting', running: 'running', interrupted: 'interrupted', completed: 'done', done: 'done', errored: 'failed', failed: 'failed', shutdown: 'closed', closed: 'closed', not_found: 'not-found' }[key ?? ''] ?? 'unreported';
}
/** Retains identity/lifecycle metadata only, never prompt or completion bodies. */
export class AgentTracker {
    agents;
    parent;
    calls = new Map();
    aliases = new Map();
    activityEvents = new Set();
    activityTimes = new Map();
    taskEnds = new Map();
    taskStarts = new Map();
    constructor(agents, parent) {
        this.agents = agents;
        this.parent = parent;
    }
    resolve(id) { return this.aliases.get(id) ?? id; }
    activityAt(id) { return this.activityTimes.get(this.resolve(id)); }
    timing(id) {
        const target = this.resolve(id), row = this.agents.find(a => a.id === target);
        return { startedAt: this.taskStarts.get(target), endedAt: row && !['starting', 'running', 'unreported', 'unknown'].includes(row.status) ? this.taskEnds.get(target) : undefined };
    }
    start(id, value) { const at = typeof value === 'number' ? value : Date.parse(String(value ?? '')); if (Number.isFinite(at))
        this.taskStarts.set(id, Math.max(at, this.taskStarts.get(id) ?? -Infinity)); }
    touch(id, value) {
        const at = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
        if (!Number.isFinite(at))
            return;
        this.activityTimes.set(id, Math.max(at, this.activityTimes.get(id) ?? -Infinity));
        const row = this.agents.find(a => a.id === id), ended = this.taskEnds.get(id), start = this.timing(id).startedAt;
        if (row && !['starting', 'running', 'unknown', 'unreported'].includes(row.status) && (ended === undefined || start !== undefined && start > ended))
            this.taskEnds.set(id, at);
        while (this.activityTimes.size > 128)
            this.activityTimes.delete(this.activityTimes.keys().next().value);
    }
    model(id, value, fillOnly = false) { const model = text(value), agent = this.agents.find(a => a.id === this.resolve(id)); if (agent && model && (!fillOnly || !agent.model))
        agent.model = model; }
    update(id, name, status, alias, preserve = false) {
        const previous = alias ? this.resolve(alias) : id, old = this.agents.find(a => a.id === previous), existing = this.agents.find(a => a.id === id);
        const preferred = old?.name && old.name !== 'agent' ? old.name : existing?.name && existing.name !== 'agent' ? existing.name : name ?? 'agent';
        const row = existing ?? old;
        if (existing && old && existing !== old)
            this.agents.splice(this.agents.indexOf(old), 1);
        if (row) {
            row.id = id;
            row.name = preferred;
            if (!preserve || ['starting', 'unreported'].includes(row.status))
                row.status = status;
        }
        else
            this.agents.push({ id, name: preferred, status });
        if (alias) {
            for (const [key, value] of this.aliases)
                if (value === previous)
                    this.aliases.set(key, id);
            this.aliases.set(alias, id);
        }
        const previousTime = this.activityTimes.get(previous);
        if (previousTime !== undefined)
            this.activityTimes.set(id, Math.max(previousTime, this.activityTimes.get(id) ?? -Infinity));
        const previousEnd = this.taskEnds.get(previous);
        if (previousEnd !== undefined && !this.taskEnds.has(id))
            this.taskEnds.set(id, previousEnd);
        const previousStart = this.taskStarts.get(previous);
        if (previousStart !== undefined)
            this.start(id, previousStart);
        const live = this.agents.filter(a => ['starting', 'running'].includes(a.status)).slice(-64), uncertain = this.agents.filter(a => ['unknown', 'unreported'].includes(a.status));
        const slots = 64 - live.length, unknown = slots ? uncertain.slice(-slots) : [], historySlots = slots - unknown.length, history = this.agents.filter(a => !['starting', 'running', 'unknown', 'unreported'].includes(a.status));
        const retained = new Set([...live, ...unknown, ...(historySlots ? history.slice(-historySlots) : [])].map(a => a.id));
        this.agents.splice(0, this.agents.length, ...this.agents.filter(a => retained.has(a.id)));
        for (const key of this.taskEnds.keys())
            if (!retained.has(key))
                this.taskEnds.delete(key);
        for (const key of this.taskStarts.keys())
            if (!retained.has(key))
                this.taskStarts.delete(key);
        while (this.aliases.size > 128)
            this.aliases.delete(this.aliases.keys().next().value);
    }
    call(id, kind, args, timestamp) {
        const previous = this.calls.get(id);
        if (previous) {
            const name = text(args?.task_name), row = this.agents.find(a => a.id === this.resolve(previous.target ?? 'call:' + id));
            if (kind === 'spawn_agent' && name && row)
                row.name = name;
            return;
        }
        if (!['spawn_agent', 'wait', 'wait_agent', 'close_agent', 'resume_agent', 'interrupt_agent', 'followup_task', 'send_message'].includes(kind))
            return;
        const target = text(args?.agent_id ?? args?.id ?? args?.target);
        const startedAt = Date.parse(String(timestamp ?? ''));
        this.calls.set(id, { kind, target, startedAt: Number.isFinite(startedAt) ? startedAt : undefined });
        while (this.calls.size > 128)
            this.calls.delete(this.calls.keys().next().value);
        if (kind === 'spawn_agent') {
            this.update('call:' + id, text(args?.task_name ?? args?.agent_type), 'starting');
            this.start('call:' + id, timestamp);
            this.touch('call:' + id, timestamp);
        }
    }
    result(id, output, failed, timestamp) {
        const call = this.calls.get(id);
        if (!call)
            return;
        if (call.canonical) {
            const target = call.target;
            if (!failed && call.kind === 'spawn_agent' && target && !this.agents.find(a => a.id === this.resolve(target))?.model)
                this.model(target, output?.model);
            return;
        }
        if (call.kind === 'spawn_agent') {
            const pending = 'call:' + id, real = text(output?.agent_id ?? output?.thread_id ?? output?.task_name);
            if (failed) {
                this.update(this.resolve(pending), undefined, 'failed');
                this.touch(this.resolve(pending), timestamp);
            }
            else if (real) {
                this.update(this.resolve(real), text(output?.nickname ?? output?.agent_nickname), output?.status === undefined ? 'running' : agentStatus(output.status), pending, true);
                call.target = this.resolve(real);
                this.model(real, output?.model, true);
                this.touch(this.resolve(real), call.startedAt);
            }
            return;
        }
        if (failed)
            return;
        if (call.kind === 'send_message')
            return;
        if (['wait', 'wait_agent'].includes(call.kind)) {
            this.statuses(output?.status ?? output?.statuses, timestamp);
            return;
        }
        if (call.target) {
            const restarts = ['followup_task', 'resume_agent'].includes(call.kind);
            if (restarts && !this.agents.some(a => a.id === this.resolve(call.target)))
                return;
            const status = call.kind === 'close_agent' ? 'closed' : call.kind === 'interrupt_agent' ? 'interrupted' : output?.status === undefined ? restarts ? 'starting' : undefined : agentStatus(output.status);
            if (status) {
                const target = this.resolve(call.target);
                this.update(target, undefined, status);
                if (restarts)
                    this.start(target, call.startedAt);
                this.touch(target, ['starting', 'running'].includes(status) ? call.startedAt : timestamp ?? call.startedAt);
            }
        }
    }
    statuses(values, timestamp) { if (object(values))
        for (const [id, status] of Object.entries(values).slice(0, 64)) {
            this.update(this.resolve(id), undefined, agentStatus(status));
            if (timestamp)
                this.touch(this.resolve(id), timestamp);
        } }
    event(p, timestamp) {
        const type = p.type;
        if (typeof type !== 'string' || !(/^(collab_|sub_agent_activity$|subagent_|agent_started$|agent_completed$)/.test(type)))
            return false;
        if (p.sender_thread_id && p.sender_thread_id !== this.parent)
            return true;
        const call = text(p.call_id), receiver = text(p.receiver_thread_id), nickname = text(p.receiver_agent_nickname ?? p.receiver_agent_role);
        let advanceActivity = true, activityTimestamp = timestamp;
        switch (type) {
            case 'collab_agent_spawn_begin':
                if (call && !this.calls.has(call))
                    this.call(call, 'spawn_agent', {}, timestamp);
                break;
            case 'collab_agent_spawn_end': {
                if (call && this.calls.get(call)?.canonical)
                    return true;
                const id = text(p.new_thread_id), status = agentStatus(p.status);
                if (id) {
                    this.update(this.resolve(id), text(p.new_agent_nickname ?? p.new_agent_role), status, call ? 'call:' + call : undefined);
                    this.model(id, p.model);
                    const requested = call ? this.calls.get(call)?.startedAt : undefined;
                    if (requested !== undefined || ['starting', 'running'].includes(status))
                        this.start(this.resolve(id), requested ?? timestamp);
                }
                else if (call)
                    this.update(this.resolve('call:' + call), undefined, status === 'unreported' ? 'failed' : status);
                if (call)
                    this.calls.set(call, { kind: 'spawn_agent', target: id, canonical: true, startedAt: this.calls.get(call)?.startedAt ?? Date.parse(String(timestamp ?? '')) });
                break;
            }
            case 'collab_waiting_end':
                this.statuses(p.statuses);
                if (Array.isArray(p.agent_statuses))
                    for (const entry of p.agent_statuses.slice(0, 64)) {
                        const id = text(entry?.thread_id);
                        if (id)
                            this.update(this.resolve(id), text(entry.agent_nickname ?? entry.agent_role), agentStatus(entry.status));
                    }
                break;
            case 'collab_agent_interaction_end':
            case 'collab_resume_end':
                if (receiver) {
                    const id = this.resolve(receiver), status = agentStatus(p.status), request = call ? this.calls.get(call) : undefined;
                    this.update(id, nickname, status);
                    if (type === 'collab_resume_end' || request && ['followup_task', 'resume_agent'].includes(request.kind)) {
                        if (['starting', 'running'].includes(status))
                            this.start(id, request?.startedAt ?? timestamp);
                        if (request) {
                            request.target = id;
                            request.canonical = true;
                        }
                    }
                }
                break;
            // The close event reports status before closing, not the resulting lifecycle.
            case 'collab_close_end':
                if (receiver)
                    this.update(this.resolve(receiver), nickname, agentStatus(p.status) === 'not-found' ? 'not-found' : 'closed');
                break;
            case 'sub_agent_activity': {
                const event = text(p.event_id ?? p.id);
                if (event && this.activityEvents.has(event))
                    return true;
                if (event) {
                    this.activityEvents.add(event);
                    while (this.activityEvents.size > 128)
                        this.activityEvents.delete(this.activityEvents.values().next().value);
                }
                const request = event ? this.calls.get(event) : undefined, id = text(p.agent_thread_id), alias = text(p.agent_path);
                const restarts = !!request && ['followup_task', 'resume_agent'].includes(request.kind);
                if (p.kind === 'interacted') {
                    advanceActivity = restarts;
                    if (restarts)
                        activityTimestamp = request.startedAt ?? timestamp;
                }
                const existing = this.agents.find(a => a.id === id || !!alias && a.id === this.resolve(alias));
                const status = p.kind === 'interacted' ? (restarts ? 'running' : existing?.status ?? 'unreported') : { started: 'running', interrupted: 'interrupted', completed: 'done' }[p.kind];
                if (id && status) {
                    this.update(id, alias?.split('/').at(-1), status, request?.kind === 'spawn_agent' ? 'call:' + event : alias);
                    if (alias)
                        this.aliases.set(alias, id);
                    if (p.kind === 'started' || p.kind === 'interacted' && restarts)
                        this.start(id, request?.startedAt ?? timestamp);
                    this.model(id, p.model);
                    if (request) {
                        request.target = id;
                        request.canonical = true;
                    }
                    else if (event && p.kind === 'started')
                        this.calls.set(event, { kind: 'spawn_agent', target: id, canonical: true, startedAt: Date.parse(String(timestamp ?? '')) });
                }
                break;
            }
            case 'subagent_started':
            case 'agent_started':
            case 'subagent_stopped':
            case 'agent_completed': {
                const id = text(p.agent_id ?? p.thread_id);
                if (id) {
                    this.update(this.resolve(id), text(p.name ?? p.agent_name), ['subagent_started', 'agent_started'].includes(type) ? 'running' : p.success === false ? 'failed' : 'done');
                    if (['subagent_started', 'agent_started'].includes(type))
                        this.start(this.resolve(id), timestamp);
                }
                break;
            }
        }
        const affected = text(p.agent_thread_id ?? p.new_thread_id ?? p.receiver_thread_id ?? p.agent_id ?? p.thread_id);
        if (affected && advanceActivity)
            this.touch(this.resolve(affected), activityTimestamp);
        if (type === 'collab_waiting_end' && object(p.statuses))
            for (const id of Object.keys(p.statuses).slice(0, 64))
                this.touch(this.resolve(id), timestamp);
        while (this.calls.size > 128)
            this.calls.delete(this.calls.keys().next().value);
        return true;
    }
}
