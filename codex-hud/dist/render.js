import { get, unsupported } from './config.js';
import { colorize, displayWidth, sanitize, truncate, wrapAnsi, wrapFields } from './terminal-text.js';
import { agentRows } from './agent-display.js';
function num(n) { return n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)); }
function percent(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function windowLabel(minutes) { return minutes % 1440 === 0 ? minutes / 1440 + 'd' : minutes % 60 === 0 ? minutes / 60 + 'h' : minutes + 'm'; }
export function render(s, c, o = {}) {
    const width = Math.max(1, Math.min(o.width ?? 100, get(c, 'maxWidth') > 0 ? get(c, 'maxWidth') : Infinity) - get(c, 'terminal.margin'));
    const height = Math.max(1, Math.floor(o.height ?? 1000));
    const now = o.now ?? Date.now();
    const lang = get(c, 'language');
    const en = lang === 'en';
    const trad = lang === 'zh-Hant';
    const label = (english, chinese, traditional = chinese) => en ? english : trad ? traditional : chinese;
    const unknown = label('unknown', '未知');
    const on = (k) => !!get(c, 'display.' + k);
    const ink = (text, key) => colorize(text, get(c, 'colors.' + key), !!o.color && !process.env.NO_COLOR);
    const bar = (p) => { const n = Math.round(Math.max(0, Math.min(100, p)) / 10); return sanitize(get(c, 'colors.barFilled')).repeat(n) + sanitize(get(c, 'colors.barEmpty')).repeat(10 - n); };
    const groups = new Map();
    const fields = new Map(), separate = new Map();
    const model = sanitize(get(c, 'display.modelOverride') || s.model || unknown);
    const formattedModel = get(c, 'display.modelFormat') === 'full' ? model : model.replace(/\s*\([^)]*context[^)]*\)/gi, '');
    let effort = '';
    if (on('showEffortLevel') && s.effort) {
        const symbol = { low: '◔', medium: '◑', high: '◕', xhigh: '●' }[s.effort] ?? '◑';
        const format = get(c, 'display.effortFormat');
        effort = ' ' + (format === 'symbol' ? symbol : format === 'text' ? sanitize(s.effort) : symbol + ' ' + sanitize(s.effort));
    }
    const identity = {};
    if (on('showModel'))
        identity.model = ink('[' + formattedModel + effort + ']', 'model');
    else if (effort)
        identity.model = ink(effort.trim(), 'model');
    if (on('showProvider') && (get(c, 'display.providerName') || s.provider))
        identity.model = ink(String(get(c, 'display.providerName') || s.provider), 'label') + ' ' + (identity.model ?? '');
    const parts = sanitize(s.cwd ?? '').replace(/\\/g, '/').split('/').filter(Boolean);
    const project = get(c, 'pathLevels') === 'full' ? sanitize(s.cwd) : parts.slice(-Number(get(c, 'pathLevels'))).join('/');
    let projectText = on('showProject') ? ink(project || unknown, 'project') : '';
    const git = s.environment?.git;
    if (get(c, 'gitStatus.enabled') && git) {
        const branch = get(c, 'gitStatus.branchOverflow') === 'truncate' ? truncate(git.branch, Math.max(8, Math.floor(width * 0.45))) : sanitize(git.branch);
        let status = 'git:(' + branch + (get(c, 'gitStatus.showDirty') && git.dirty ? '*' : '');
        if (get(c, 'gitStatus.showAheadBehind'))
            status += (git.ahead ? ' ↑' + git.ahead : '') + (git.behind ? ' ↓' + git.behind : '');
        if (get(c, 'gitStatus.showFileStats'))
            status += ' !' + git.modified + ' +' + git.added + ' ?' + git.untracked;
        status += ')';
        const critical = get(c, 'gitStatus.pushCriticalThreshold'), warning = get(c, 'gitStatus.pushWarningThreshold');
        projectText += (projectText ? ' ' : '') + ink(status, critical > 0 && git.ahead >= critical ? 'critical' : warning > 0 && git.ahead >= warning ? 'warning' : 'gitBranch');
    }
    if (projectText)
        identity.project = projectText;
    if (on('showSessionName'))
        identity.sessionName = ink(label('Session: ', '会话: ', '會話: ') + (s.sessionName ?? unknown), 'label');
    if (on('showCodexVersion'))
        identity.version = ink('Codex ' + (s.version ?? unknown), 'label');
    if (on('showAuth') && s.plan)
        identity.auth = ink(s.plan, 'label');
    function timestamp(value) {
        const time = typeof value === 'number' ? value : Date.parse(value);
        if (!Number.isFinite(time))
            return unknown;
        const absolute = new Date(time).toLocaleString(en ? 'en-US' : trad ? 'zh-TW' : 'zh-CN', { hourCycle: get(c, 'display.hourCycle') === 'auto' ? undefined : get(c, 'display.hourCycle'), second: on('showClockSeconds') ? '2-digit' : undefined });
        const minutes = Math.abs(Math.round((time - now) / 60000));
        const relative = (minutes >= 60 ? Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm' : minutes + 'm') + (time < now ? label(' ago', '前') : label(' left', '后', '後'));
        const format = get(c, 'display.timeFormat');
        return format === 'absolute' ? absolute : ['both', 'elapsedAndAbsolute'].includes(format) ? relative + ' / ' + absolute : relative;
    }
    if (on('showDuration') && s.startedAt) {
        const duration = Math.max(0, Math.floor((now - Date.parse(s.startedAt)) / 60000));
        identity.duration = ink(label('Duration ', '时长 ', '時長 ') + (duration >= 60 ? Math.floor(duration / 60) + 'h ' : '') + duration % 60 + 'm', 'label');
    }
    const custom = sanitize(get(c, 'display.customLine') ?? '');
    const requested = get(c, 'projectLineOrder');
    const order = [...new Set([...requested, 'model', 'project', 'sessionName', 'version', 'duration', 'auth'])];
    const header = order.map(k => identity[k]).filter(Boolean).join(' | ');
    if (header)
        groups.set('project', header);
    const tokenParts = [];
    if (on('showContextBar')) {
        if (s.context && s.context.window > 0) {
            const p = Math.max(0, Math.min(100, s.context.used / s.context.window * 100));
            const mode = get(c, 'display.contextValue');
            const value = mode === 'tokens' ? num(s.context.used) + '/' + num(s.context.window) : mode === 'remaining' ? percent(100 - p) + '% ' + label('remaining', '剩余', '剩餘') : mode === 'both' ? percent(p) + '% (' + num(s.context.used) + '/' + num(s.context.window) + ')' : percent(p) + '%';
            tokenParts.push(ink(label('Context ', '上下文 ') + bar(p) + ' ' + value, p >= get(c, 'display.contextCriticalThreshold') ? 'critical' : p >= get(c, 'display.contextWarningThreshold') ? 'warning' : 'context'));
        }
        else
            tokenParts.push(ink(label('Context: ', '上下文: ') + unknown, 'label'));
    }
    if (on('showTokenBreakdown') && s.latest)
        tokenParts.push(ink('in:' + num(s.latest.input) + ' cache:' + num(s.latest.cached) + ' out:' + num(s.latest.output), 'label'));
    if (on('showSessionTokens') && s.totals)
        tokenParts.push(ink(label('Session tokens ', '会话 Token ', '會話 Token ') + num(s.totals.total) + ' (in:' + num(s.totals.input) + ' cache:' + num(s.totals.cached) + ' out:' + num(s.totals.output) + ')', 'label'));
    if (tokenParts.length) {
        groups.set('context', tokenParts.join(' | '));
        fields.set('context', tokenParts);
    }
    if (on('showUsage')) {
        const enabled = (minutes) => minutes === 300 ? on('showFiveHourUsage') : minutes === 10080 ? on('showSevenDayUsage') : true;
        const quotas = s.quotas.filter(q => enabled(q.minutes) && q.usedPercent >= (q.minutes >= 10080 ? get(c, 'display.sevenDayThreshold') : get(c, 'display.usageThreshold'))).map((q) => {
            const remaining = get(c, 'display.usageValue') === 'remaining';
            const p = remaining ? 100 - q.usedPercent : q.usedPercent;
            const progress = get(c, 'display.usageBarEnabled') && !get(c, 'display.usageCompact') ? bar(p) + ' ' : '';
            let reset = '';
            if (q.resetsAt) {
                const ended = q.resetsAt * 1000 <= now;
                reset = ' (' + (ended ? label('awaiting refresh', '待刷新') : ((on('showResetLabel') ? label('resets ', '重置 ') : '') + timestamp(q.resetsAt * 1000))) + ')';
            }
            return ink(windowLabel(q.minutes) + ': ' + progress + percent(p) + '%' + (remaining ? ' ' + label('left', '剩余', '剩餘') : '') + reset, q.usedPercent >= 90 ? 'critical' : 'usage');
        });
        if (quotas.length) {
            groups.set('usage', quotas.join(' | '));
            fields.set('usage', quotas);
        }
    }
    if (on('showMcp')) {
        const configured = s.environment?.mcp.filter(m => m.enabled).map(m => m.name) ?? [];
        const disabled = s.environment?.mcp.filter(m => !m.enabled).length ?? 0;
        const facts = [];
        if (configured.length)
            facts.push(label('configured ', '配置 ') + configured.map(sanitize).join(','));
        if (disabled)
            facts.push(label('disabled ', '禁用 ') + disabled);
        if (s.mcpUsed.length)
            facts.push(label('called ', '已调用 ', '已調用 ') + s.mcpUsed.map(sanitize).join(','));
        if (facts.length)
            groups.set('mcp', ink('MCP: ' + facts.join(' | '), 'label'));
    }
    if (on('showTools') && s.tools.length) {
        const grouped = new Map();
        s.tools.forEach((t, i) => { if (t.status !== 'running' && Number.isFinite(t.finishedAt) && (t.finishedAt > now || now - t.finishedAt > 60000))
            return; const key = t.name + '\0' + t.status, entry = grouped.get(key); if (entry) {
            entry.count++;
            entry.last = i;
        }
        else
            grouped.set(key, { name: t.name, status: t.status, count: 1, last: i }); });
        const ordered = [...grouped.values()].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.last - a.last), limit = Math.trunc(get(c, 'display.toolsMaxVisible')) || ordered.length;
        const visible = ordered.slice(0, limit), format = (t) => ink((t.status === 'running' ? '◐ ' : t.status === 'failed' ? '✗ ' : t.status === 'cancelled' ? '⊘ ' : '✓ ') + (get(c, 'display.toolNameMaxLength') ? truncate(t.name, get(c, 'display.toolNameMaxLength')) : sanitize(t.name)) + ' ×' + t.count, t.status === 'failed' ? 'critical' : 'label');
        const current = visible.filter(t => t.status === 'running'), recent = visible.filter(t => t.status !== 'running'), parts = [];
        if (current.length)
            parts.push(label('Current: ', '当前: ', '目前: ') + current.map(format).join(' | '));
        if (recent.length)
            parts.push(label('Recent: ', '近期: ') + recent.map(format).join(' | '));
        if (ordered.length > limit)
            parts.push('+' + (ordered.length - limit) + ' ' + label('more', '更多'));
        if (parts.length)
            groups.set('tools', parts.join(' | '));
    }
    if (on('showAgents') && s.agents.length) {
        const rows = agentRows(s.agents, lang, now, get(c, 'display.agentsMaxVisible')).map(row => ink(row, 'label'));
        if (rows.length) {
            groups.set('agents', rows[0]);
            separate.set('agents', rows);
        }
    }
    if (on('showTodos') && s.todos.length) {
        const pending = s.todos.filter(t => t.status !== 'completed'), done = s.todos.length - pending.length;
        groups.set('todos', ink(label('Todo: ', '待办: ', '待辦: ') + (pending.length ? pending.map(t => (t.status === 'in_progress' ? '▸ ' : '○ ') + sanitize(t.step)).join(' | ') : '✓ ' + label('All tasks complete', '全部完成')) + ' (' + done + '/' + s.todos.length + ')', 'label'));
    }
    const sessionTime = [];
    if (on('showSessionStartDate') && s.startedAt)
        sessionTime.push(label('Started ', '开始 ', '開始 ') + timestamp(s.startedAt));
    if (on('showLastResponseAt') && s.lastResponseAt)
        sessionTime.push(label('Last response ', '最后响应 ', '最後回應 ') + timestamp(s.lastResponseAt));
    if (on('showCompactions'))
        sessionTime.push(label('Compactions: ', '压缩: ', '壓縮: ') + s.compactions);
    if (sessionTime.length)
        groups.set('sessionTime', ink(sessionTime.join(' | '), 'label'));
    for (const [flag, reason] of Object.entries(unsupported))
        if (on(flag))
            groups.set('unsupported-' + flag, ink((en ? flag : reason) + ': ' + label('unavailable', '不可用'), 'label'));
    const elementOrder = [...new Set([...get(c, 'elementOrder'), ...groups.keys()])];
    const blocks = [];
    const used = new Set();
    for (const key of elementOrder) {
        if (used.has(key) || !groups.has(key))
            continue;
        const merge = separate.has(key) ? undefined : get(c, 'display.mergeGroups').find(g => g.includes(key));
        const keys = (merge ?? [key]).filter(k => groups.has(k) && !used.has(k) && (!separate.has(k) || k === key));
        keys.forEach(k => used.add(k));
        let text = keys.map(k => groups.get(k)).join(' | ');
        const right = get(c, 'display.rightAlign').filter(k => keys.includes(k));
        if (right.length && keys.length > 1) {
            const leftText = keys.filter(k => !right.includes(k)).map(k => groups.get(k)).join(' | ');
            const rightText = right.map(k => groups.get(k)).join(' | ');
            const space = width - displayWidth(leftText) - displayWidth(rightText);
            if (space >= 2)
                text = leftText + ' '.repeat(space) + rightText;
        }
        blocks.push({ keys, text, fields: right.length ? [text] : keys.flatMap(k => fields.get(k) ?? [groups.get(k)]), rows: separate.get(key) });
    }
    let logical = [];
    if (custom && get(c, 'display.customLinePosition') === 'first')
        logical.push([ink(custom, 'custom')]);
    if (get(c, 'lineLayout') === 'compact') {
        let packed = [];
        for (const b of blocks) {
            if (b.rows) {
                if (packed.length)
                    logical.push(packed);
                packed = [];
                logical.push(...b.rows.map(row => [row]));
            }
            else
                packed.push(...b.fields);
        }
        if (packed.length)
            logical.push(packed);
    }
    else
        blocks.forEach((b, i) => { if (i && get(c, 'showSeparators'))
            logical.push([ink('─'.repeat(Math.min(width, 60)), 'label')]); if (b.rows)
            logical.push(...b.rows.map(row => [row]));
        else
            logical.push(b.fields); });
    if (custom && get(c, 'display.customLinePosition') === 'last')
        logical.push([ink(custom, 'custom')]);
    const errors = [...s.errors, ...(s.environment?.errors ?? [])];
    const warnings = errors.flatMap(error => wrapAnsi(ink('! ' + sanitize(error), 'critical'), width));
    const body = logical.flatMap(line => wrapFields(line, width));
    const all = [...warnings, ...body];
    if (!all.length)
        all.push(ink(label('No visible fields', '未启用显示项'), 'label'));
    if (all.length <= height)
        return { lines: all, totalLines: all.length, pages: 1 };
    if (height === 1 && warnings.length)
        return { lines: [warnings[0]], totalLines: all.length, pages: 1 };
    const pinned = warnings.length ? [warnings[0]] : [];
    const pageable = warnings.length ? [...warnings.slice(1), ...body] : all;
    const showPager = o.showPager !== false && height >= pinned.length + 2, capacity = Math.max(1, height - pinned.length - (showPager ? 1 : 0));
    const pages = Math.max(1, Math.ceil(pageable.length / capacity)), page = Math.min(pages - 1, Math.max(0, o.page ?? 0));
    const lines = [...pinned, ...pageable.slice(page * capacity, (page + 1) * capacity)];
    if (showPager && pages > 1)
        lines.push(ink(truncate('[' + (page + 1) + '/' + pages + '] ' + label('←/→ page · q close', '←/→ 翻页 · q 关闭', '←/→ 翻頁 · q 關閉'), width), 'label'));
    return { lines, totalLines: all.length, pages };
}
