import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from './vendor/smol-toml/index.js';
const cache = new Map();
export function readEnvironment(cwd, home) {
    const key = cwd + '\0' + home;
    const old = cache.get(key);
    if (old && Date.now() - old.time < 5000)
        return old.value;
    const facts = { mcp: [], errors: [] };
    try {
        const raw = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v1', '--branch', '--untracked-files=normal'], { encoding: 'utf8', timeout: 1500, windowsHide: true, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        const lines = raw.split(/\r?\n/);
        const header = lines.shift() ?? '';
        const branch = header.replace(/^## /, '').split('...')[0].replace(/ \[.*$/, '');
        const status = lines.filter(Boolean);
        facts.git = { branch, dirty: status.length > 0, ahead: Number(header.match(/ahead (\d+)/)?.[1] ?? 0), behind: Number(header.match(/behind (\d+)/)?.[1] ?? 0), modified: status.filter(x => !x.startsWith('??') && !/^A.|^.A/.test(x)).length, added: status.filter(x => /^A.|^.A/.test(x)).length, untracked: status.filter(x => x.startsWith('??')).length };
    }
    catch { /* non-Git directories are normal */ }
    // Only report user-configured servers. Project trust and runtime connectivity cannot be inferred here.
    try {
        const file = path.join(home, 'config.toml');
        if (fs.statSync(file).size > 1024 * 1024)
            throw new Error('Configuration is too large');
        const config = parse(fs.readFileSync(file, 'utf8'));
        const servers = config.mcp_servers;
        if (servers && typeof servers === 'object' && !Array.isArray(servers))
            for (const [name, value] of Object.entries(servers)) {
                const enabled = !!value && typeof value === 'object' && !Array.isArray(value) ? value.enabled !== false : true;
                facts.mcp.push({ name, enabled });
            }
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            facts.errors.push('Failed to read user MCP configuration');
    }
    cache.set(key, { time: Date.now(), value: facts });
    if (cache.size > 32)
        cache.delete(cache.keys().next().value);
    return facts;
}
