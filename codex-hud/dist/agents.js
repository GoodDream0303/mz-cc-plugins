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
    constructor(agents, parent) {
        this.agents = agents;
        this.parent = parent;
    }
    resolve(id) { return this.aliases.get(id) ?? id; }
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
        this.agents.splice(0, Math.max(0, this.agents.length - 64));
        while (this.aliases.size > 128)
            this.aliases.delete(this.aliases.keys().next().value);
    }
    call(id, kind, args) {
        const previous = this.calls.get(id);
        if (previous) {
            const name = text(args?.task_name), row = this.agents.find(a => a.id === this.resolve(previous.target ?? 'call:' + id));
            if (kind === 'spawn_agent' && name && row)
                row.name = name;
            return;
        }
        if (!['spawn_agent', 'wait', 'wait_agent', 'close_agent', 'resume_agent', 'interrupt_agent', 'followup_task'].includes(kind))
            return;
        const target = text(args?.agent_id ?? args?.id ?? args?.target);
        this.calls.set(id, { kind, target });
        while (this.calls.size > 128)
            this.calls.delete(this.calls.keys().next().value);
        if (kind === 'spawn_agent')
            this.update('call:' + id, text(args?.task_name ?? args?.agent_type), 'starting');
    }
    result(id, output, failed) {
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
            if (failed)
                this.update(this.resolve(pending), undefined, 'failed');
            else if (real) {
                this.update(this.resolve(real), text(output?.nickname ?? output?.agent_nickname), output?.status === undefined ? 'running' : agentStatus(output.status), pending, true);
                call.target = this.resolve(real);
                this.model(real, output?.model, true);
            }
            return;
        }
        if (failed)
            return;
        if (['wait', 'wait_agent'].includes(call.kind)) {
            this.statuses(output?.status ?? output?.statuses);
            return;
        }
        if (call.target) {
            const status = call.kind === 'close_agent' ? 'closed' : call.kind === 'interrupt_agent' ? 'interrupted' : output?.status === undefined ? undefined : agentStatus(output.status);
            if (status)
                this.update(this.resolve(call.target), undefined, status);
        }
    }
    statuses(values) { if (object(values))
        for (const [id, status] of Object.entries(values).slice(0, 64))
            this.update(this.resolve(id), undefined, agentStatus(status)); }
    event(p) {
        const type = p.type;
        if (typeof type !== 'string' || !(/^(collab_|sub_agent_activity$|subagent_|agent_started$|agent_completed$)/.test(type)))
            return false;
        if (p.sender_thread_id && p.sender_thread_id !== this.parent)
            return true;
        const call = text(p.call_id), receiver = text(p.receiver_thread_id), nickname = text(p.receiver_agent_nickname ?? p.receiver_agent_role);
        switch (type) {
            case 'collab_agent_spawn_begin':
                if (call && !this.calls.has(call))
                    this.call(call, 'spawn_agent', {});
                break;
            case 'collab_agent_spawn_end': {
                if (call && this.calls.get(call)?.canonical)
                    break;
                const id = text(p.new_thread_id), status = agentStatus(p.status);
                if (id) {
                    this.update(this.resolve(id), text(p.new_agent_nickname ?? p.new_agent_role), status, call ? 'call:' + call : undefined);
                    this.model(id, p.model);
                }
                else if (call)
                    this.update(this.resolve('call:' + call), undefined, status === 'unreported' ? 'failed' : status);
                if (call)
                    this.calls.set(call, { kind: 'spawn_agent', target: id, canonical: true });
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
                if (receiver)
                    this.update(this.resolve(receiver), nickname, agentStatus(p.status));
                break;
            // The close event reports status before closing, not the resulting lifecycle.
            case 'collab_close_end':
                if (receiver)
                    this.update(this.resolve(receiver), nickname, agentStatus(p.status) === 'not-found' ? 'not-found' : 'closed');
                break;
            case 'sub_agent_activity': {
                const event = text(p.event_id ?? p.id);
                if (event && this.activityEvents.has(event))
                    break;
                if (event) {
                    this.activityEvents.add(event);
                    while (this.activityEvents.size > 128)
                        this.activityEvents.delete(this.activityEvents.values().next().value);
                }
                const id = text(p.agent_thread_id), alias = text(p.agent_path), status = { started: 'running', interacted: 'running', interrupted: 'interrupted', completed: 'done' }[p.kind];
                if (id && status) {
                    const request = event ? this.calls.get(event) : undefined;
                    this.update(id, alias?.split('/').at(-1), status, request?.kind === 'spawn_agent' ? 'call:' + event : alias);
                    if (alias)
                        this.aliases.set(alias, id);
                    this.model(id, p.model);
                    if (request) {
                        request.target = id;
                        request.canonical = true;
                    }
                }
                break;
            }
            case 'subagent_started':
            case 'agent_started':
            case 'subagent_stopped':
            case 'agent_completed': {
                const id = text(p.agent_id ?? p.thread_id);
                if (id)
                    this.update(this.resolve(id), text(p.name ?? p.agent_name), ['subagent_started', 'agent_started'].includes(type) ? 'running' : p.success === false ? 'failed' : 'done');
                break;
            }
        }
        while (this.calls.size > 128)
            this.calls.delete(this.calls.keys().next().value);
        return true;
    }
}
