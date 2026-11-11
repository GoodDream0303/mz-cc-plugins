import { execFileSync } from 'node:child_process';
const cache = new Map();
export function readEnvironment(cwd) {
    const key = cwd;
    const old = cache.get(key);
    if (old && Date.now() - old.time < 5000)
        return old.value;
    const facts = { errors: [] };
    try {
        const raw = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v1', '--branch', '--untracked-files=normal'], { encoding: 'utf8', timeout: 1500, windowsHide: true, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        const lines = raw.split(/\r?\n/);
        const header = lines.shift() ?? '';
        const branch = header.replace(/^## /, '').split('...')[0].replace(/ \[.*$/, '');
        const status = lines.filter(Boolean);
        facts.git = { branch, dirty: status.length > 0, ahead: Number(header.match(/ahead (\d+)/)?.[1] ?? 0), behind: Number(header.match(/behind (\d+)/)?.[1] ?? 0), modified: status.filter(x => !x.startsWith('??') && !/^A.|^.A/.test(x)).length, added: status.filter(x => /^A.|^.A/.test(x)).length, untracked: status.filter(x => x.startsWith('??')).length };
    }
    catch { /* non-Git directories are normal */ }
    cache.set(key, { time: Date.now(), value: facts });
    if (cache.size > 32)
        cache.delete(cache.keys().next().value);
    return facts;
}
