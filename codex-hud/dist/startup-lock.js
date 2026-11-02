import fs from 'node:fs';
import path from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
const claimName = /^([1-9]\d*)-([a-f0-9-]{36})\.json$/i;
export function processIsLive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const code = error.code;
        if (code === 'ESRCH')
            return false;
        if (code === 'EPERM')
            return true;
        return undefined;
    }
}
function readClaim(file) {
    try {
        if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 1024)
            return;
        const c = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (c.pid + '-' + c.token + '.json' !== path.basename(file) || !Number.isInteger(c.pid) || c.pid <= 0)
            return;
        return c;
    }
    catch {
        return;
    }
}
export async function acquireStartupLock(directory) {
    // Never replace/remove the shared container. Every immutable claim has its
    // own PID+nonce name; stale observers can only remove a dead owner's name.
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory())
        throw new Error('Invalid startup lock directory');
    const deadline = Date.now() + 1000;
    do {
        const token = randomUUID(), file = path.join(directory, process.pid + '-' + token + '.json'), temp = file + '.tmp';
        const claim = { token, pid: process.pid, at: Date.now() };
        try {
            fs.writeFileSync(temp, JSON.stringify(claim), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temp, file);
        }
        finally {
            try {
                fs.unlinkSync(temp);
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
        }
        const release = () => { const owned = readClaim(file); if (owned?.token === token && owned.pid === process.pid) {
            try {
                fs.unlinkSync(file);
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
        } };
        let contended = false;
        try {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                if (entry.name === path.basename(file))
                    continue;
                const match = entry.name.match(claimName);
                if (!match)
                    continue;
                const otherFile = path.join(directory, entry.name), pid = Number(match[1]);
                if (!Number.isSafeInteger(pid) || processIsLive(pid) !== false) {
                    contended = true;
                    continue;
                }
                // Ready claims are atomic publications. Dead-owner cleanup cannot remove a
                // replacement claim, whose nonce/path is always different.
                try {
                    fs.unlinkSync(otherFile);
                }
                catch (error) {
                    if (error.code !== 'ENOENT')
                        contended = true;
                }
            }
            if (!contended && readClaim(file)?.token === token)
                return release;
        }
        catch (error) {
            release();
            throw error;
        }
        release();
        if (Date.now() >= deadline)
            return;
        await new Promise(r => setTimeout(r, randomInt(10, 31)));
    } while (Date.now() < deadline);
}
