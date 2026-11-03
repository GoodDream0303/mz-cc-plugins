import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
export const upstreamBackendCommit = '20aa1d7254ee93f64dafa059ef89341d9767470a';
const backendDirectory = fileURLToPath(new URL('../backend/', import.meta.url));
function packagedPin(directory = backendDirectory) {
    try {
        return JSON.parse(fs.readFileSync(path.join(directory, 'psmux-compact.json'), 'utf8'));
    }
    catch {
        return;
    }
}
export function verifyBackend(binary, output, pin) {
    // psmux preserves a tmux-compatible first line before its own build identity.
    const versions = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('psmux '));
    if (versions.length !== 1)
        return;
    const version = versions[0];
    if (/^psmux 3\.4\.0 \(20aa1d7\b/.test(version))
        return { kind: 'upstream' };
    if (!/^psmux 3\.4\.0-hud-compact-v1 \(20aa1d7\b/.test(version))
        return;
    const expected = pin ?? packagedPin();
    if (expected?.format !== 1 || expected.version !== '3.4.0-hud-compact-v1' || expected.upstreamCommit !== upstreamBackendCommit || !/^[a-f0-9]{64}$/.test(expected.sha256))
        return;
    try {
        if (createHash('sha256').update(fs.readFileSync(binary)).digest('hex') !== expected.sha256)
            return;
        return { kind: 'compact' };
    }
    catch { /* Unverified replacements and missing binaries are rejected. */ }
}
export function packagedBackendPath(directory = backendDirectory) {
    const pin = packagedPin(directory), binary = path.join(directory, 'psmux.exe');
    return pin && verifyBackend(binary, 'psmux ' + pin.version + ' (20aa1d7)', pin)?.kind === 'compact' ? binary : '';
}
export function effectiveBackendPath(binary, home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')) {
    const relative = path.relative(path.join(home, 'plugins', 'cache'), binary).split(path.sep);
    // Paths inside the plugin's versioned backend directory are package-managed.
    // User portable installations outside that directory remain explicit choices.
    if (relative.length === 5 && /^[a-zA-Z0-9_-]+$/.test(relative[0]) && relative[1] === 'codex-hud' && /^[a-zA-Z0-9_.+-]+$/.test(relative[2]) && relative[3] === 'backend' && relative[4] === 'psmux.exe')
        return packagedBackendPath();
    return binary;
}
