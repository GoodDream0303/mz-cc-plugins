import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { get, configPath, loadConfig, startupEnabled, defaultConfig } from './config.js';
import { codexHome } from './sessions.js';
import { readHostOrigin } from './psmux.js';
import { inspectSetup } from './setup-readiness.js';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function runtimeRoot(file = configPath()) { return path.join(path.dirname(file), 'runtime'); }
function write(file, value) { const temp = file + '.' + randomUUID() + '.tmp'; try {
    fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
}
finally {
    try {
        fs.unlinkSync(temp);
    }
    catch { }
} }
export function createLaunch(cwd, config, root = runtimeRoot(), configFile = configPath()) {
    const id = randomUUID();
    fs.mkdirSync(root, { recursive: true });
    const file = path.resolve(root, id + '.json');
    const d = { kind: 'mz-codex-hud/2', id, file, cwd: path.resolve(cwd), codexHome: codexHome(), configFile: path.resolve(configFile), createdAt: new Date().toISOString(), state: 'created', paneSize: get(config, 'terminal.paneSize') };
    write(file, d);
    return d;
}
export function readLaunch(file) {
    if (fs.lstatSync(file).isSymbolicLink())
        throw new Error('Launch descriptors cannot be symbolic links');
    if (fs.statSync(file).size > 65536)
        throw new Error('Invalid launch descriptor');
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!['mz-codex-hud/1', 'mz-codex-hud/2'].includes(d.kind) || !guid.test(d.id) || path.basename(file) !== d.id + '.json' || path.resolve(d.file) !== path.resolve(file) || typeof d.cwd !== 'string' || typeof d.configFile !== 'string' || typeof d.codexHome !== 'string' || !['created', 'running', 'exited'].includes(d.state))
        throw new Error('Invalid launch descriptor');
    return d;
}
export function updateLaunch(file, change) {
    const lock = file + '.lock';
    const deadline = Date.now() + 1000;
    for (;;) {
        try {
            fs.mkdirSync(lock);
            break;
        }
        catch (e) {
            if (e.code !== 'EEXIST' || Date.now() > deadline)
                throw new Error('Launch metadata busy; retry or run doctor');
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
    }
    try {
        const d = readLaunch(file);
        change(d);
        write(file, d);
        return d;
    }
    finally {
        fs.rmdirSync(lock);
    }
}
export function requestStop(file) { updateLaunch(file, d => { d.hudStop = true; }); }
export function selectSessionId(explicit, environment = process.env) {
    const id = explicit ?? environment.CODEX_THREAD_ID ?? environment.CODEX_SESSION_ID;
    if (id !== undefined && !/^[a-zA-Z0-9_-]{3,100}$/.test(id))
        throw new Error('Invalid session ID');
    return id;
}
export function buildTerminalArgs(d, window = 'last') {
    if (!d.demo)
        throw new Error('Windows Terminal cannot identify the exact source pane; a verified psmux host is required');
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(window))
        throw new Error('Invalid Windows Terminal window ID or name');
    const entry = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'cli.js')).href;
    const boot = "import(Buffer.from(process.argv[1],'base64').toString()).then(m=>m.main(process.argv.slice(2))).catch(e=>{console.error(e.message),process.exitCode=1})";
    const shared = [process.execPath, '-e', boot, Buffer.from(entry).toString('base64')], launch64 = Buffer.from(d.file).toString('base64');
    const viewer = [...shared, 'watch', '--launch64', launch64];
    if (d.demo)
        return ['-w', 'mz-codex-hud-' + d.id, 'new-tab', '--title', 'Codex HUD Preview ' + d.id.slice(0, 8), '--suppressApplicationTitle', ...shared, 'demo-runner', '--launch64', launch64, ';', 'split-pane', '--horizontal', '--size', String(d.paneSize), '--title', 'Codex HUD', '--suppressApplicationTitle', ...viewer, ';', 'focus-pane', '-t', '0'];
    throw new Error('A verified psmux host is required');
}
export function checkRuntime(options = {}) {
    let terminalCheck = { status: 'available' };
    try {
        execFileSync('where.exe', ['wt.exe'], { stdio: 'ignore', windowsHide: true, timeout: 1500 });
    }
    catch (error) {
        const failure = error;
        const code = typeof failure?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(failure.code) ? failure.code : Number.isSafeInteger(failure?.status) ? 'EXIT_' + failure.status : undefined;
        terminalCheck = { status: failure?.code === 'ETIMEDOUT' ? 'timed-out' : failure?.status === 1 && !failure.code ? 'missing' : 'failed', ...(code ? { code } : {}) };
    }
    const terminal = terminalCheck.status === 'available';
    const file = options.configFile ?? configPath();
    let status = fs.existsSync(file) ? 'valid' : 'defaults', enabled = false, legacyEnabled = false, config = defaultConfig();
    try {
        config = loadConfig(file);
        enabled = startupEnabled(config);
        legacyEnabled = !!get(config, 'startup.enabled');
    }
    catch {
        status = 'invalid';
    }
    const configured = status !== 'invalid' && !!get(config, 'host.psmuxPath');
    const setup = inspectSetup(config, { ...options.setup, configValid: status !== 'invalid' && options.setup?.configValid !== false });
    let origin = 'unavailable';
    try {
        readHostOrigin();
        origin = 'present';
    }
    catch { }
    let display = { status: 'not-selected' };
    if (options.launchFile) {
        try {
            const d = readLaunch(options.launchFile);
            display = { status: d.state === 'exited' ? 'closed' : d.hudStop ? 'stopping' : 'open' };
        }
        catch {
            display = { status: 'invalid-launch' };
        }
    }
    let current = false;
    try {
        current = !!selectSessionId(undefined);
    }
    catch { }
    const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    let lastResult;
    try {
        const result = JSON.parse(fs.readFileSync(path.join(runtimeRoot(file), 'autostart-status.json'), 'utf8'));
        if (['opened', 'already-open', 'disabled', 'ignored', 'busy', 'failed'].includes(result.status))
            lastResult = result.status;
    }
    catch { }
    return { node: process.version, terminal, terminalCheck, hooksRequired: false, nativeStatusline: 'unchanged', host: { backend: 'psmux', configured, origin, verification: 'required-at-attach' }, autostart: { enabled, legacyEnabled, trigger: 'SessionStart', trust: 'unknown', hookFilesPresent: ['hooks/hooks.json', 'hooks/session-start.mjs', 'dist/autostart.js'].every(f => fs.existsSync(path.join(pluginRoot, f))), lastResult }, configuration: { status, path: file }, session: { status: current ? 'Codex environment available' : 'Select explicitly or start from inside Codex' }, display, setup, notes: setup.steps };
}
