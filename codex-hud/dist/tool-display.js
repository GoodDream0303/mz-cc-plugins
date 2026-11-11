import { get } from './config.js';
import { commandOperation } from './command-details.js';
import { isAgentAction, toolCategory } from './tool-details.js';
import { colorize, displayWidth, sanitize, truncate, wrapAnsi } from './terminal-text.js';
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
const glyph = (status) => status === 'running' ? '◐ ' : status === 'failed' ? '✗ ' : status === 'cancelled' ? '⊘ ' : '✓ ';
const foreground = (status) => status === 'running' ? 'active' : status === 'failed' ? 'critical' : 'inactive';
export function toolRows(snapshot, config, options) {
    const { width, now } = options, language = get(config, 'language');
    const label = (en, zh, trad = zh) => language === 'en' ? en : language === 'zh-Hant' ? trad : zh;
    const ink = (text, key) => colorize(text, get(config, 'colors.' + key), options.color && !process.env.NO_COLOR);
    const minorLabels = { read: label('Read', '读取', '讀取'), search: label('Search', '搜索', '搜尋'), list: label('List', '列举', '列舉'), write: label('Edit', '修改'), copy: label('Copy', '复制', '複製'), move: label('Move', '移动', '移動'), delete: label('Delete', '删除', '刪除'), archive: label('Archive', '压缩解压', '壓縮解壓'), build: label('Build', '构建', '建置'), test: label('Test', '测试', '測試'), check: label('Check', '校验', '校驗'), benchmark: label('Benchmark', '性能测试', '效能測試'), install: label('Dependencies', '依赖管理', '相依管理'), environment: label('Environment', '环境检查', '環境檢查'), process: label('Processes', '进程管理', '程序管理'), network: label('Network', '网络操作', '網路操作'), wait: label('Wait', '等待'), git: 'Git', other: label('Unclassified', '未分类', '未分類') };
    const gitVerbs = new Set(['status', 'diff', 'log', 'show', 'add', 'commit', 'fetch', 'push', 'pull', 'merge', 'rebase', 'checkout', 'switch', 'branch', 'restore', 'reset', 'rev-parse', 'ls-remote', 'cat-file', 'worktree', 'tag', 'stash']);
    function minor(action) {
        if (!action)
            return minorLabels.other;
        if (action.kind === 'mixed') {
            const operations = action.operations ?? ['other'];
            return [...new Set(operations)].filter(kind => Object.hasOwn(minorLabels, kind)).sort((a, b) => Object.keys(minorLabels).indexOf(a) - Object.keys(minorLabels).indexOf(b)).map(kind => minorLabels[kind]).join('+') || minorLabels.other;
        }
        if (action.kind === 'git' && action.target && gitVerbs.has(action.target))
            return 'Git ' + action.target;
        return minorLabels[commandOperation(action)];
    }
    const names = new Map();
    for (const [keys, name] of [
        [['exec_command', 'functions.exec_command'], label('Run command', '执行命令', '執行命令')],
        [['exec', 'functions.exec'], label('Run script', '执行脚本', '執行腳本')],
        [['request_user_input_async', 'functions.request_user_input_async'], label('Ask user', '向你提问', '向你提問')],
        [['clock.sleep'], label('Wait', '短暂等待', '短暫等待')],
    ])
        for (const key of keys)
            names.set(key, name);
    const actionLabels = { patch: label('Apply patch', '应用补丁', '套用修補'), agentSpawn: label('Start agent', '启动代理', '啟動代理'), agentFollowup: label('Follow up on task', '跟进子任务', '跟進子任務'), agentMessage: label('Message agent', '发送代理消息', '傳送代理訊息'), agentInterrupt: label('Interrupt agent', '中断代理', '中斷代理'), agentResume: label('Resume agent', '恢复代理', '恢復代理'), agentClose: label('Close agent', '关闭代理', '關閉代理'), agentWait: label('Wait for agents', '等待代理') };
    for (const [name, kind] of [['spawn_agent', 'agentSpawn'], ['followup_task', 'agentFollowup'], ['send_message', 'agentMessage'], ['interrupt_agent', 'agentInterrupt'], ['resume_agent', 'agentResume'], ['close_agent', 'agentClose'], ['wait_agent', 'agentWait']]) {
        names.set(name, actionLabels[kind]);
        names.set('collaboration.' + name, actionLabels[kind]);
    }
    const calls = new Map();
    snapshot.tools.forEach((tool, last) => calls.set(tool.id, { tool, last }));
    const categories = new Map(), ordinary = new Map();
    for (const { tool, last } of calls.values()) {
        if (tool.status !== 'running' && Number.isFinite(tool.finishedAt) && (tool.finishedAt > now || now - tool.finishedAt > 60000))
            continue;
        const major = toolCategory(tool.name);
        if (major) {
            const key = major + '\0' + (tool.status === 'running' ? 'current' : 'recent'), item = categories.get(key) ?? { major, entries: [], last };
            const name = minor(tool.action), entry = item.entries.find(entry => entry.minor === name && entry.tool.status === tool.status);
            if (entry) {
                entry.count++;
                entry.last = last;
                entry.tool = tool;
            }
            else
                item.entries.push({ tool, count: 1, last, minor: name });
            item.last = last;
            categories.set(key, item);
        }
        else {
            const key = tool.action ? 'call\0' + tool.id : 'name\0' + tool.name + '\0' + tool.status, item = ordinary.get(key);
            if (item) {
                item.entries[0].count++;
                item.last = last;
            }
            else
                ordinary.set(key, { entries: [{ tool, count: 1, last, minor: '' }], last });
        }
    }
    const ordinaryOrder = [...ordinary.values()].sort((a, b) => Number(b.entries[0].tool.status === 'running') - Number(a.entries[0].tool.status === 'running') || b.last - a.last), limit = Math.trunc(get(config, 'display.toolsMaxVisible')) || ordinaryOrder.length;
    const items = [...categories.values(), ...ordinaryOrder.slice(0, limit)];
    const shortened = (name) => get(config, 'display.toolNameMaxLength') ? truncate(name, get(config, 'display.toolNameMaxLength')) : sanitize(name);
    function entryText(entry) {
        const elapsed = entry.count === 1 ? toolTime(entry.tool, now) : '';
        return ink(glyph(entry.tool.status) + entry.minor + ' ×' + entry.count + (elapsed ? ' · ' + elapsed : ''), foreground(entry.tool.status));
    }
    function majorName(item, short = false) {
        return item.major === 'command' ? short ? label('Cmd', '命令') : label('Run command', '执行命令', '執行命令') : short ? label('Script', '脚本', '腳本') : label('Run script', '执行脚本', '執行腳本');
    }
    function format(item, short = false) {
        if (item.major) {
            const name = majorName(item, short), entries = item.entries;
            if (entries.length === 1 && entries[0].minor === minorLabels.other) {
                const entry = entries[0], elapsed = entry.count === 1 ? toolTime(entry.tool, now) : '';
                return ink(glyph(entry.tool.status) + shortened(name) + ' ×' + entry.count + (elapsed ? ' · ' + elapsed : ''), foreground(entry.tool.status));
            }
            return ink(name + ' › ', entries[0].tool.status === 'running' ? 'active' : 'inactive') + entries.map(entryText).join(' · ');
        }
        const entry = item.entries[0], tool = entry.tool, action = tool.action;
        const target = action && isAgentAction(action) && action.target ? (snapshot.agents.find(agent => agent.id === action.target)?.name ?? action.target).replace(/^\/root\//, '') : undefined;
        const name = action ? (actionLabels[action.kind] ?? minor(action)) + (target ? ' · ' + sanitize(target) : '') : names.get(tool.name) ?? tool.name;
        const elapsed = action ? toolTime(tool, now) : '';
        return ink(glyph(tool.status) + shortened(name) + (action ? (elapsed ? ' · ' + elapsed : '') : ' ×' + entry.count), foreground(tool.status));
    }
    function atoms(item) {
        const full = format(item);
        if (displayWidth(full) <= width)
            return [full];
        if (!item.major)
            return wrapAnsi(full, width);
        const compact = format(item, true);
        if (displayWidth(compact) <= width)
            return [compact];
        const prefix = ink(majorName(item, true) + ' › ', item.entries[0].tool.status === 'running' ? 'active' : 'inactive'), prefixWidth = displayWidth(prefix);
        if (width - prefixWidth < 2)
            return [ink(majorName(item, true), item.entries[0].tool.status === 'running' ? 'active' : 'inactive'), ...item.entries.flatMap(entry => wrapAnsi(entryText(entry), width))];
        const result = [];
        let current = '';
        for (const entry of item.entries) {
            const text = entryText(entry), joined = current ? current + ' · ' + text : prefix + text;
            if (displayWidth(joined) <= width) {
                current = joined;
                continue;
            }
            if (current) {
                result.push(current);
                current = '';
            }
            if (prefixWidth + displayWidth(text) <= width)
                current = prefix + text;
            else {
                const wrapped = wrapAnsi(text, width - prefixWidth);
                result.push(...wrapped.map(line => prefix + line));
            }
        }
        if (current)
            result.push(current);
        return result;
    }
    function pack(heading, section) {
        if (!section.length)
            return [];
        const result = [], headingWidth = displayWidth(heading);
        let text = heading, indent = 0, hasContent = false;
        for (const item of section)
            for (const atom of atoms(item)) {
                const joined = text + (hasContent ? ' | ' : '') + atom;
                if (indent + displayWidth(joined) <= width) {
                    text = joined;
                    hasContent = true;
                    continue;
                }
                if (text)
                    result.push({ text, indent });
                indent = headingWidth + displayWidth(atom) <= width ? headingWidth : 0;
                text = atom;
                hasContent = true;
            }
        if (text)
            result.push({ text, indent });
        return result;
    }
    const rows = [];
    for (const running of [true, false]) {
        const section = items.filter(item => (item.entries[0].tool.status === 'running') === running);
        for (const item of section)
            if (item.major)
                item.entries.sort((a, b) => Number(b.tool.status === 'failed') - Number(a.tool.status === 'failed') || b.last - a.last);
        section.sort((a, b) => Number(b.entries.some(entry => entry.tool.status === 'failed')) - Number(a.entries.some(entry => entry.tool.status === 'failed')) || b.last - a.last);
        rows.push(...pack(ink((running ? '▸ ' : '◷ ') + (running ? label('Current: ', '当前: ', '目前: ') : label('Recent: ', '近期: ')), 'heading'), section));
    }
    if (ordinaryOrder.length > limit)
        rows.push({ text: ink('+' + (ordinaryOrder.length - limit) + ' ' + label('more', '更多'), 'inactive') });
    return rows;
}
