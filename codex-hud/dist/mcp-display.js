import { sanitize } from './terminal-text.js';
import { toolDetails } from './tool-details.js';
const official = new Set(['codex_apps', 'codex_tui']);
function label(language, en, zh, tw = zh) { return language === 'zh-Hans' ? zh : language === 'zh-Hant' ? tw : en; }
export function mcpIdentity(tool) { return tool.mcp ?? toolDetails(tool.name).mcp; }
function stateLabel(state, language) {
    const labels = {
        unknown: ['? Unknown', '? 未知', '? 未知'], notStarted: ['○ Not started', '○ 未启动', '○ 未啟動'], starting: ['◐ Starting', '◐ 启动中', '◐ 啟動中'], connected: ['● Connected', '● 已连接', '● 已連線'], authenticationRequired: ['! Authentication required', '! 需要认证', '! 需要驗證'], failed: ['! Failed', '! 失败', '! 失敗'], cancelled: ['○ Cancelled', '○ 已取消', '○ 已取消'], disabled: ['⊘ Disabled', '⊘ 已禁用', '⊘ 已停用'], mixed: ['◑ Mixed', '◑ 状态不一', '◑ 狀態不一']
    };
    return label(language, ...(labels[state] ?? labels.unknown));
}
/** Configuration/history establish names; only matching fresh runtime facts establish state. */
export function mcpConnectionRows(snapshot, language, now = Date.now()) {
    const names = new Map();
    for (const server of snapshot.environment?.mcp ?? [])
        names.set(server.name, server.enabled);
    for (const name of snapshot.mcpUsed)
        if (!names.has(name))
            names.set(name, true);
    for (const tool of snapshot.tools) {
        const identity = mcpIdentity(tool);
        if (identity && !names.has(identity.server))
            names.set(identity.server, true);
    }
    const runtime = snapshot.mcpRuntime;
    const live = runtime?.sessionId === snapshot.sessionId && runtime.complete && Number.isFinite(runtime.checkedAt) && now >= runtime.checkedAt && now - runtime.checkedAt <= 12000 ? new Map(runtime.servers.map(s => [s.name, s.status])) : new Map();
    for (const name of live.keys())
        if (!names.has(name))
            names.set(name, true);
    const officialStates = [...live].filter(([name]) => official.has(name)).map(([, state]) => state);
    const combined = !officialStates.length || officialStates.includes('unknown') ? 'unknown' : new Set(officialStates).size === 1 ? officialStates[0] : 'mixed';
    const foreign = [...names].filter(([name]) => !official.has(name));
    const rows = [label(language, 'MCP connections: Official ', 'MCP连接: 官方 ', 'MCP連線: 官方 ') + stateLabel(combined, language)];
    if (foreign.length)
        rows[0] += ' | ' + foreign.map(([name, enabled]) => sanitize(name) + ' ' + (live.has(name) ? stateLabel(live.get(name), language) : enabled ? stateLabel('unknown', language) : '⊘ ' + label(language, 'Disabled (config)', '禁用（配置）'))).join(' | ');
    return { rows, persistent: foreign.length > 0 };
}
export function toolTime(tool, now) {
    const elapsed = tool.status === 'running' ? tool.startedAt === undefined ? undefined : now - tool.startedAt : tool.durationMs ?? (tool.startedAt === undefined || tool.finishedAt === undefined ? undefined : tool.finishedAt - tool.startedAt);
    if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed < 0)
        return '';
    if (elapsed < 1000)
        return Math.round(elapsed) + 'ms';
    if (elapsed < 60000)
        return (elapsed / 1000).toFixed(1).replace(/\.0$/, '') + 's';
    return Math.floor(elapsed / 60000) + 'm ' + Math.floor(elapsed % 60000 / 1000) + 's';
}
export function mcpCallRows(tools, language, now, limit) {
    const active = tools.filter(tool => tool.status === 'running' && mcpIdentity(tool));
    const visible = active.slice(0, limit > 0 ? Math.trunc(limit) : active.length);
    const rows = visible.map((tool, index) => {
        const identity = mcpIdentity(tool), elapsed = toolTime(tool, now);
        return { text: (index === 0 ? label(language, 'MCP calls: ', 'MCP调用: ', 'MCP呼叫: ') : '') + '◐ ' + sanitize(identity.server) + ' / ' + sanitize(identity.tool) + (elapsed ? ' · ' + elapsed : ''), indent: index === 0 ? 0 : 2 };
    });
    if (active.length > visible.length)
        rows.push({ text: '+' + (active.length - visible.length) + ' ' + label(language, 'more calls', '项调用', '項呼叫'), indent: 2 });
    return rows;
}
