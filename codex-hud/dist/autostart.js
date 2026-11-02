import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { get, loadConfig, configPath } from './config.js';
import { runtimeRoot } from './runtime.js';
import { loadCurrentHost, bindHostSession } from './host-session.js';
const idPattern = /^[a-zA-Z0-9_-]{3,100}$/;
async function metadata(file) {
    let handle;
    try {
        handle = await fsp.open(file, 'r');
        const chunks = [];
        let size = 0;
        const buffer = Buffer.alloc(65536);
        while (size < 2 * 1024 * 1024) {
            const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, 2 * 1024 * 1024 - size), size);
            if (!bytesRead)
                return;
            const piece = buffer.subarray(0, bytesRead), end = piece.indexOf(10);
            chunks.push(Buffer.from(end < 0 ? piece : piece.subarray(0, end)));
            size += bytesRead;
            if (end >= 0) {
                const row = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
                return row.type === 'session_meta' && row.payload && typeof row.payload === 'object' ? row.payload : undefined;
            }
        }
    }
    catch { /* metadata may still be written at SessionStart */ }
    finally {
        await handle?.close();
    }
}
export async function autoStart(event, options = {}) {
    if (event.hook_event_name !== 'SessionStart' || !['startup', 'resume', 'clear', 'fork'].includes(String(event.source)) || event.agent_id || event.subagent_id || event.agent_transcript_path)
        return { status: 'ignored', reason: 'not-main-start' };
    if (process.platform !== 'win32')
        return { status: 'ignored', reason: 'not-windows' };
    const file = options.configFile ?? configPath(), config = loadConfig(file);
    if (!get(config, 'startup.enabled'))
        return { status: 'disabled' };
    if (typeof event.session_id !== 'string' || !idPattern.test(event.session_id) || typeof event.transcript_path !== 'string' || !path.isAbsolute(event.transcript_path))
        return { status: 'ignored', reason: 'missing-transcript' };
    let meta;
    const deadline = Date.now() + 2000;
    do {
        meta = await metadata(event.transcript_path);
        if (meta)
            break;
        await new Promise(r => setTimeout(r, 100));
    } while (Date.now() < deadline);
    if (!meta)
        return { status: 'ignored', reason: 'metadata-unavailable' };
    if (meta.source !== 'cli')
        return { status: 'ignored', reason: 'not-cli-main' };
    if (typeof meta.id !== 'string' || !idPattern.test(meta.id) || event.session_id !== meta.id && event.session_id !== meta.session_id || typeof meta.cwd !== 'string')
        return { status: 'ignored', reason: 'identity-mismatch' };
    let record;
    try {
        record = loadCurrentHost('hook', options.dependencies, options.environment);
    }
    catch {
        return { status: 'ignored', reason: 'unproven-host' };
    }
    const result = await bindHostSession(record, meta.id, event.transcript_path, { role: 'hook', config, configFile: file, dependencies: options.dependencies });
    return result.status === 'stopping' ? { status: 'ignored', reason: 'hud-stopping' } : { status: result.status };
}
export async function runAutostartHook() {
    let status = 'failed', reason = 'startup-failed';
    try {
        process.stdin.setEncoding('utf8');
        let input = '';
        for await (const chunk of process.stdin) {
            input += chunk;
            if (Buffer.byteLength(input) > 1024 * 1024)
                throw new Error('Hook input too large');
        }
        const result = await autoStart(JSON.parse(input));
        status = result.status;
        reason = result.reason ?? '';
    }
    catch {
        process.stderr.write('Codex HUD autostart failed; run mz-codex-hud doctor.\n');
    }
    try {
        const root = runtimeRoot();
        fs.mkdirSync(root, { recursive: true });
        const file = path.join(root, 'autostart-status.json'), temp = path.join(root, '.autostart-status-' + randomUUID() + '.tmp');
        try {
            fs.writeFileSync(temp, JSON.stringify({ at: new Date().toISOString(), status, reason }), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temp, file);
        }
        finally {
            try {
                fs.unlinkSync(temp);
            }
            catch { }
        }
    }
    catch { /* diagnostics must not interfere with Codex startup */ }
}
