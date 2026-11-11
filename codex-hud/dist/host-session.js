import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { configPath, get } from './config.js';
import { createLaunch, readLaunch, updateLaunch, requestStop } from './runtime.js';
import { PsmuxClient, readHostOrigin, readProcessFacts, verifyHost, hostProcessIds, hostIdPattern, samePath, sameProcess } from './psmux.js';
import { acquireStartupLock } from './startup-lock.js';
import { planInitialPaneSize } from './pane-size.js';
import { emptySnapshot } from './types.js';
function atomic(file, value) {
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
        fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
        fs.renameSync(temp, file);
    }
    finally {
        try {
            fs.unlinkSync(temp);
        }
        catch { }
    }
}
function fact(value) { return { pid: value.pid, parentPid: value.parentPid, name: value.name, startedAt: value.startedAt }; }
export function registerHost(proof, root = proof.origin.hostDir, cwd = process.cwd()) {
    if (!samePath(root, proof.origin.hostDir) || !hostIdPattern.test(proof.origin.originId))
        throw new Error('Invalid host registration path');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(root).isSymbolicLink())
        throw new Error('Host registry cannot be a symbolic link');
    const file = path.resolve(root, proof.origin.originId + '.json');
    if (fs.existsSync(file))
        throw new Error('Host origin already registered');
    const origin = proof.origin;
    const record = { kind: 'mz-hud-host/1', id: origin.originId, file, proof: { origin: { binary: origin.binary, dataDir: origin.dataDir, hostDir: origin.hostDir, namespace: origin.namespace, tmux: origin.tmux, session: origin.session, pane: origin.pane, originId: origin.originId }, owner: fact(proof.owner), server: fact(proof.server), window: proof.window }, cwd: path.resolve(cwd), createdAt: new Date().toISOString(), state: 'running' };
    if (proof.frontend)
        record.proof.frontend = fact(proof.frontend);
    atomic(file, record);
    return record;
}
export function readHost(file) {
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 32768)
        throw new Error('Invalid host registration file');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.kind !== 'mz-hud-host/1' || !hostIdPattern.test(value.id) || path.basename(file) !== value.id + '.json' || !samePath(value.file, file) || !value.proof?.origin || value.proof.origin.originId !== value.id || !samePath(path.dirname(file), value.proof.origin.hostDir) || !path.isAbsolute(value.cwd) || !['running', 'closed'].includes(value.state))
        throw new Error('Invalid host registration');
    if (value.launchFile && (!samePath(path.dirname(value.launchFile), path.dirname(path.dirname(file))) || !hostIdPattern.test(path.basename(value.launchFile, '.json'))))
        throw new Error('Invalid host display reference');
    return value;
}
function updateHost(input, change) {
    const lock = input.file + '.lock', deadline = Date.now() + 1000;
    for (;;)
        try {
            fs.mkdirSync(lock);
            break;
        }
        catch (error) {
            if (error.code !== 'EEXIST' || Date.now() >= deadline)
                throw new Error('Host metadata busy; retry or run doctor');
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
    try {
        const current = readHost(input.file), before = input.proof, after = current.proof;
        if (!sameProcess(after.owner, before.owner) || !sameProcess(after.server, before.server) || after.window !== before.window)
            throw new Error('Source host incarnation changed');
        for (const key of ['originId', 'namespace', 'tmux', 'session', 'pane'])
            if (after.origin[key] !== before.origin[key])
                throw new Error('Source host origin changed');
        for (const key of ['binary', 'dataDir', 'hostDir'])
            if (!samePath(after.origin[key], before.origin[key]))
                throw new Error('Source host paths changed');
        change(current);
        atomic(current.file, current);
        return current;
    }
    finally {
        fs.rmdirSync(lock);
    }
}
function currentOriginRecord(env = process.env) {
    const origin = readHostOrigin(env), record = readHost(path.join(origin.hostDir, origin.originId + '.json')), expected = record.proof.origin;
    for (const key of ['namespace', 'tmux', 'session', 'pane', 'originId'])
        if (origin[key] !== expected[key])
            throw new Error('Current host origin contradicts its source registration');
    for (const key of ['binary', 'dataDir', 'hostDir'])
        if (!samePath(origin[key], expected[key]))
            throw new Error('Current host paths contradict its source registration');
    if (record.state !== 'running')
        throw new Error('Source host has already closed');
    return record;
}
export function loadCurrentHost(role = 'hook', dependencies = {}, env = process.env) {
    const record = currentOriginRecord(env);
    verifyHost(record.proof, role, dependencies);
    return record;
}
export function registerCurrentFrontend() {
    const record = currentOriginRecord(), values = readProcessFacts(hostProcessIds(record.proof, [process.pid])), own = values.find(p => p.pid === process.pid);
    verifyHost(record.proof, 'frontend', { processes: () => values });
    if (!own)
        throw new Error('Official frontend identity is unavailable');
    updateHost(record, current => {
        if (current.state !== 'running' || current.proof.frontend && !sameProcess(current.proof.frontend, own))
            throw new Error('A different or closed official frontend already owns this host');
        current.proof.frontend = fact(own);
    });
}
function ownedDisplay(record, d) {
    if (!d.host || !samePath(d.host.recordFile, record.file) || d.host.proof.origin.originId !== record.id || d.host.proof.owner.pid !== record.proof.owner.pid || d.host.proof.owner.startedAt !== record.proof.owner.startedAt || d.host.proof.server.startedAt !== record.proof.server.startedAt)
        throw new Error('Display does not belong to this exact host');
}
function applyBinding(file, binding) {
    if (binding)
        updateLaunch(file, d => { d.sessionId = binding.id; d.transcriptPath = binding.transcript; });
}
function bindPublishedIntent(input, binding, dependencies) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const record = readHost(input.file);
        if (record.state !== 'running' || !record.launchFile)
            return { status: 'busy' };
        const file = record.launchFile, display = readLaunch(file);
        ownedDisplay(record, display);
        const expected = display.host.hudProcess;
        const values = (dependencies.processes ?? readProcessFacts)(hostProcessIds(record.proof, expected ? [expected.pid] : []), dependencies.pid ?? process.pid);
        verifyHost(record.proof, 'hook', { ...dependencies, processes: () => values });
        if (expected) {
            if (display.pid !== expected.pid || !sameProcess(values.find(p => p.pid === expected.pid), expected))
                throw new Error('Existing HUD viewer incarnation changed');
            const pane = new PsmuxClient(record.proof.origin, dependencies).pane(display.host.hudPane ?? '');
            if (pane.pid !== expected.pid || pane.window !== record.proof.window)
                throw new Error('Existing HUD viewer pane incarnation changed');
        }
        let retry = false, status = 'busy';
        updateLaunch(file, d => {
            const current = readHost(record.file);
            ownedDisplay(record, d);
            ownedDisplay(current, d);
            if (current.state !== 'running' || !record.proof.frontend || !sameProcess(current.proof.frontend, record.proof.frontend))
                throw new Error('SessionStart source is no longer current');
            if (current.launchFile !== file) {
                retry = true;
                return;
            }
            if (d.state === 'exited' || d.hudStop) {
                status = 'stopping';
                return;
            }
            if (expected ? !sameProcess(d.host.hudProcess, expected) || d.pid !== display.pid || d.host.hudPane !== display.host.hudPane : !!d.host.hudProcess) {
                retry = true;
                return;
            }
            d.sessionId = binding.id;
            d.transcriptPath = binding.transcript;
        });
        if (!retry)
            return { status, launchFile: file };
    }
    throw new Error('HUD viewer or display intent changed during SessionStart proof');
}
export async function ensureHostDisplay(input, config, options = {}) {
    options.signal?.throwIfAborted();
    const dependencies = options.dependencies ?? {}, release = await acquireStartupLock(path.join(input.proof.origin.hostDir, '.locks', input.id));
    if (!release) {
        // The owner may be waiting for its viewer while the frontend emits SessionStart.
        // Binding the published intent needs the launch-file lock, not another split.
        if (options.role !== 'hook' || !options.binding)
            return { status: 'busy' };
        return bindPublishedIntent(input, options.binding, dependencies);
    }
    try {
        options.signal?.throwIfAborted();
        const record = readHost(input.file);
        if (record.state !== 'running')
            throw new Error('Source host has closed');
        const existing = record.launchFile ? readLaunch(record.launchFile) : undefined;
        if (existing)
            ownedDisplay(record, existing);
        const initial = (dependencies.processes ?? readProcessFacts)(hostProcessIds(record.proof, existing?.host?.hudProcess ? [existing.host.hudProcess.pid] : []), dependencies.pid ?? process.pid);
        const initialDependencies = { ...dependencies, processes: () => initial };
        verifyHost(record.proof, options.role ?? 'owner', initialDependencies);
        const client = new PsmuxClient(record.proof.origin, dependencies);
        if (record.launchFile) {
            const d = existing;
            const expected = d.host.hudProcess, actual = expected ? initial.find(p => p.pid === expected.pid) : undefined;
            const live = actual && expected && actual.startedAt === expected.startedAt && actual.name === expected.name;
            if (live) {
                if (d.state === 'exited' || d.hudStop)
                    return { status: 'stopping', launchFile: d.file };
                const pane = client.pane(d.host.hudPane ?? '');
                if (pane.pid !== expected.pid || pane.window !== record.proof.window)
                    throw new Error('Existing HUD pane incarnation changed');
                if (d.host.phase === 'uncertain')
                    updateLaunch(d.file, v => { v.host.phase = 'running'; });
                applyBinding(d.file, options.binding);
                return { status: 'already-open', launchFile: d.file };
            }
            if (!expected) {
                if (!d.host.reportedPane || !client.confirmsAbsent(d.host.reportedPane, record.proof.owner.pid))
                    throw new Error('HUD creation is pending or uncertain; inspect the exact host before retrying');
            }
        }
        if (options.dryRun)
            return { status: 'already-open' };
        const pane = client.pane(record.proof.origin.pane);
        if (pane.height < 12)
            throw new Error('Source pane is too short to keep Codex and its HUD visible');
        const sizing = planInitialPaneSize(config, emptySnapshot('pending'), { columns: pane.width, rows: pane.height });
        const rows = sizing.mode === 'rows' ? sizing.rows : Math.max(2, Math.min(pane.height - 11, Math.floor(pane.height * get(config, 'terminal.paneSize')), sizing.contentRows === undefined ? pane.height : sizing.contentRows + 1));
        const display = createLaunch(record.cwd, config, path.dirname(record.proof.origin.hostDir), options.configFile ?? configPath());
        const publish = (previous) => {
            if (previous) {
                ownedDisplay(record, previous);
                previous.state = 'exited';
                previous.host.phase = 'closed';
            }
            const inherited = previous && typeof previous.sessionId === 'string' && /^[a-zA-Z0-9_-]{3,100}$/.test(previous.sessionId) && typeof previous.transcriptPath === 'string' && path.isAbsolute(previous.transcriptPath) ? { id: previous.sessionId, transcript: previous.transcriptPath } : undefined, binding = options.binding ?? inherited;
            updateLaunch(display.file, d => { d.host = { recordFile: record.file, proof: record.proof, phase: 'opening' }; d.initialSizing = sizing; if (binding) {
                d.sessionId = binding.id;
                d.transcriptPath = binding.transcript;
            } });
            const published = updateHost(record, current => { if (current.state !== 'running' || current.launchFile !== record.launchFile)
                throw new Error('Source display intent changed during publication'); current.launchFile = display.file; });
            updateLaunch(display.file, d => { d.host.proof = published.proof; });
        };
        // Copy a binding and replace its pointer under the same old-launch lock used
        // by the hook; registration separately merges only its frontend field.
        if (record.launchFile)
            updateLaunch(record.launchFile, publish);
        else
            publish();
        try {
            options.onPublished?.();
            // Publish the intent before the command. A timeout never proves that no pane was created.
            const hudPane = client.split(rows, display.file), deadline = Date.now() + (options.waitMs ?? 8000);
            updateLaunch(display.file, d => { d.host.reportedPane = hudPane; });
            do {
                options.signal?.throwIfAborted();
                const current = readLaunch(display.file);
                if (current.state === 'running' && current.host?.hudProcess && current.host.hudPane === hudPane) {
                    const hud = client.pane(hudPane), processes = (dependencies.processes ?? readProcessFacts)(hostProcessIds(record.proof, [current.host.hudProcess.pid]), dependencies.pid ?? process.pid), actual = processes.find(p => p.pid === current.host.hudProcess.pid);
                    if (hud.pid !== current.pid || hud.window !== record.proof.window || actual?.startedAt !== current.host.hudProcess.startedAt)
                        throw new Error('HUD did not prove its process/pane incarnation');
                    verifyHost(record.proof, options.role ?? 'owner', { ...dependencies, processes: () => processes });
                    applyBinding(current.file, options.binding);
                    return { status: 'opened', launchFile: current.file };
                }
                if (Date.now() >= deadline)
                    break;
                await delay(50, undefined, { signal: options.signal });
            } while (true);
            throw new Error('HUD launch acknowledgement timed out; creation is uncertain');
        }
        catch (error) {
            if (!options.signal?.aborted)
                updateLaunch(display.file, d => { if (d.host)
                    d.host.phase = 'uncertain'; });
            throw error;
        }
    }
    finally {
        release();
    }
}
export async function bindHostSession(record, sessionId, transcriptPath, options) {
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(sessionId) || !path.isAbsolute(transcriptPath))
        throw new Error('Invalid host session identity');
    return ensureHostDisplay(record, options.config, { ...options, binding: { id: sessionId, transcript: transcriptPath } });
}
export function acknowledgeViewer(file) {
    const d = readLaunch(file);
    if (!d.host)
        throw new Error('Viewer has no exact host binding');
    const record = readHost(d.host.recordFile);
    ownedDisplay(record, d);
    if (record.state !== 'running' || !record.launchFile || !samePath(record.launchFile, file))
        throw new Error('Viewer intent is no longer current');
    const origin = readHostOrigin();
    for (const key of ['originId', 'namespace', 'tmux', 'session'])
        if (origin[key] !== record.proof.origin[key])
            throw new Error('Viewer inherited a different host origin');
    const processes = readProcessFacts(hostProcessIds(record.proof, [process.pid]));
    verifyHost(record.proof, 'viewer', { processes: () => processes });
    const physical = new PsmuxClient(record.proof.origin).pane(origin.pane), own = processes.find(p => p.pid === process.pid);
    if (origin.pane === record.proof.origin.pane || physical.pid !== process.pid || physical.window !== record.proof.window || !own)
        throw new Error('Viewer process does not own its HUD pane');
    updateLaunch(file, value => { value.pid = process.pid; value.state = 'running'; value.heartbeat = Date.now(); value.host.hudPane = origin.pane; value.host.hudProcess = own; value.host.phase = 'running'; });
}
export function closeHost(input, exitCode) {
    const record = updateHost(input, current => { current.state = 'closed'; current.exitCode = exitCode; });
    if (record.launchFile) {
        const d = readLaunch(record.launchFile);
        ownedDisplay(record, d);
        if (d.state !== 'exited')
            requestStop(d.file);
    }
}
