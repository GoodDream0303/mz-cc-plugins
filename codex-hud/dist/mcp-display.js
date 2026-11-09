import { sanitize } from './terminal-text.js';
import { toolDetails } from './tool-details.js';
const official = new Set(['codex_apps', 'codex_tui']);
function label(language, en, zh, tw = zh) { return language === 'zh-Hans' ? zh : language === 'zh-Hant' ? tw : en; }
export function mcpIdentity(tool) { return tool.mcp ?? toolDetails(tool.name).mcp; }
/** Configuration and historical calls establish names, never live connections. */
export function mcpConnectionRows(snapshot, language) {
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
    const foreign = [...names].filter(([name]) => !official.has(name));
    const rows = [label(language, 'MCP connections: Official ? Unknown', 'MCP连接: 官方 ? 未知', 'MCP連線: 官方 ? 未知')];
    if (foreign.length)
        rows.push(foreign.map(([name, enabled]) => sanitize(name) + (enabled ? ' ? ' + label(language, 'Unknown', '未知') : ' ⊘ ' + label(language, 'Disabled (config)', '禁用（配置）'))).join(' | '));
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
