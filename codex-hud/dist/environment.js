import { execFileSync } from 'node:child_process';
import { runText } from './subprocess.js';
const cache = new Map();
export function readEnvironment(cwd) {
    const key = cwd;
    const old = cache.get(key);
    if (old && Date.now() - old.time < 5000)
        return old.value;
    const facts = { errors: [] };
    try {
        const raw = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v1', '--branch', '--untracked-files=normal'], { encoding: 'utf8', timeout: 1500, windowsHide: true, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        facts.git = parseGit(raw);
    }
    catch { /* non-Git directories are normal */ }
    cache.set(key, { time: Date.now(), value: facts });
    if (cache.size > 32)
        cache.delete(cache.keys().next().value);
    return facts;
}
function parseGit(raw) {
    const lines = raw.split(/\r?\n/);
    const header = lines.shift() ?? '';
    const branch = header.replace(/^## /, '').split('...')[0].replace(/ \[.*$/, '');
    const status = lines.filter(Boolean);
    return { branch, dirty: status.length > 0, ahead: Number(header.match(/ahead (\d+)/)?.[1] ?? 0), behind: Number(header.match(/behind (\d+)/)?.[1] ?? 0), modified: status.filter(x => !x.startsWith('??') && !/^A.|^.A/.test(x)).length, added: status.filter(x => /^A.|^.A/.test(x)).length, untracked: status.filter(x => x.startsWith('??')).length };
}
export async function readEnvironmentAsync(cwd, signal) {
    const old = cache.get(cwd);
    if (old && Date.now() - old.time < 5000)
        return old.value;
    const facts = { errors: [] };
    try {
        const raw = await runText('git', ['-C', cwd, 'status', '--porcelain=v1', '--branch', '--untracked-files=normal'], { timeout: 1500, maxBuffer: 1024 * 1024, signal });
        facts.git = parseGit(raw);
    }
    catch (error) {
        if (signal?.aborted)
            throw error; /* non-Git directories are normal */
    }
    cache.set(cwd, { time: Date.now(), value: facts });
    if (cache.size > 32)
        cache.delete(cache.keys().next().value);
    return facts;
}
