import fs from 'node:fs';
import path from 'node:path';
import { codexHome } from './sessions.js';
import { samePath } from './psmux.js';
function semver(value) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
    if (!match)
        return;
    const pre = match[4]?.split('.') ?? [];
    if (pre.some(item => /^\d+$/.test(item) && item.length > 1 && item[0] === '0'))
        return;
    return { parts: match.slice(1, 4).map(BigInt), pre };
}
function compare(a, b) {
    const left = semver(a), right = semver(b);
    if (!left || !right)
        return a < b ? -1 : a > b ? 1 : 0;
    for (let i = 0; i < 3; i++)
        if (left.parts[i] !== right.parts[i])
            return left.parts[i] < right.parts[i] ? -1 : 1;
    if (!left.pre.length || !right.pre.length)
        return left.pre.length === right.pre.length ? 0 : left.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
        const x = left.pre[i], y = right.pre[i];
        if (x === y)
            continue;
        if (x === undefined)
            return -1;
        if (y === undefined)
            return 1;
        const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
        if (xn && yn)
            return BigInt(x) < BigInt(y) ? -1 : 1;
        if (xn !== yn)
            return xn ? -1 : 1;
        return x < y ? -1 : 1;
    }
    return 0;
}
export function assertActiveEntry(cliFile, home = codexHome()) {
    const root = path.resolve(path.dirname(cliFile), '..'), cache = path.join(home, 'plugins', 'cache'), relative = path.relative(cache, root), parts = relative.split(path.sep);
    // Explicit development checkouts and copied-package tests are not cached installs.
    if (parts.length !== 3 || parts.some(p => p === '..') || path.isAbsolute(relative)) {
        if (root.replaceAll('\\', '/').includes('/plugins/cache/'))
            throw new Error('HUD entry belongs to another Codex home; rerun setup for the active installation');
        return;
    }
    const base = path.dirname(root), versions = fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-zA-Z0-9_.+-]+$/.test(e.name) && !['.', '..'].includes(e.name)).map(e => e.name);
    versions.sort(compare);
    const active = versions.includes('local') ? 'local' : versions.at(-1);
    if (!active || !samePath(root, path.join(base, active)))
        throw new Error('PowerShell HUD entry is obsolete; rerun setup from the active installed plugin');
    if (active !== 'local' && versions.some(v => v !== active && compare(v, active) === 0))
        throw new Error('Active HUD cache version is ambiguous; resolve it before loading the entry');
}
