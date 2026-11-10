import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, get, configPath, startupEnabled } from './config.js';
import { readHostOrigin, proveOwner } from './psmux.js';
import { registerHost, ensureHostDisplay, readHost, closeHost, registerCurrentFrontend } from './host-session.js';
import { verifyBackend, effectiveBackendPath } from './backend-version.js';
import { resolveOfficial } from './entry-resolver.js';
export { resolveOfficial } from './entry-resolver.js';
const commands = new Set(['agents', 'exec', 'e', 'review', 'login', 'logout', 'mcp', 'mcp-server', 'plugin', 'app-server', 'remote-control', 'app', 'completion', 'update', 'doctor', 'sandbox', 'debug', 'apply', 'a', 'queue', 'archive', 'delete', 'migrate-rollouts', 'migrate-nfs-db', 'unarchive', 'cloud', 'cloud-tasks', 'execpolicy', 'tcp-tunnel', 'responses-api-proxy', 'stdio-to-uds', 'exec-server', 'features', 'help']);
const values = new Set(['-c', '--config', '--enable', '--disable', '--remote', '--remote-auth-token-env', '-m', '--model', '--local-provider', '-p', '--profile', '-s', '--sandbox', '-C', '--cd', '--add-dir', '-a', '--ask-for-approval']);
const flags = new Set(['--strict-config', '--oss', '--approve-for-me', '--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', '--yolo', '--not-so-yolo', '--worktree', '--search', '--no-alt-screen', '--no-daemon', '--last', '--all', '--include-non-interactive']);
export function classifyCodexInvocation(args) {
    let positional, remote = false;
    for (let i = 0; i < args.length; i++) {
        const item = args[i];
        if (item === '--')
            break;
        if (['--help', '-h', '--version', '-V'].includes(item))
            return 'passthrough';
        const key = item.split('=', 1)[0];
        if (key === '--remote')
            remote = true;
        if (values.has(key)) {
            if (!item.includes('=') && ++i >= args.length)
                return 'passthrough';
            continue;
        }
        if (item === '-i' || item === '--image') {
            while (i + 1 < args.length && !args[i + 1].startsWith('-'))
                i++;
            continue;
        }
        if (item.startsWith('-')) {
            if (flags.has(item) || /^-[cmpsCai].+/.test(item) || item.startsWith('--image='))
                continue;
            return 'passthrough';
        }
        positional ??= item;
    }
    if (positional && commands.has(positional))
        return 'passthrough';
    if (remote)
        throw new Error('Remote Codex frontend origin cannot be established by the local HUD host');
    return 'interactive';
}
export function decodeInvocation(encoded) {
    if (!encoded || encoded.length > 2 * 1024 * 1024 || !/^[a-zA-Z0-9+/]+=*$/.test(encoded))
        throw new Error('Invalid encoded Codex invocation');
    const value = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!value || typeof value.command !== 'string' || !path.isAbsolute(value.command) || !Array.isArray(value.args) || !value.args.every((v) => typeof v === 'string' && !v.includes('\0')))
        throw new Error('Invalid Codex invocation');
    return { command: value.command, args: value.args };
}
class ForegroundStartError extends Error {
}
async function foreground(file, args, env) {
    const child = spawn(file, args, { env, stdio: 'inherit', windowsHide: false });
    const onInterrupt = () => { };
    process.on('SIGINT', onInterrupt);
    try {
        return await new Promise((resolve, reject) => { child.once('error', () => reject(new ForegroundStartError('Foreground command could not start'))); child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1))); });
    }
    finally {
        process.off('SIGINT', onInterrupt);
    }
}
export async function runOfficial(invocation) {
    const command = resolveOfficial(invocation.command);
    return foreground(command.file, [...command.prefix, ...invocation.args], process.env);
}
export async function runHostFrontend(invocation) {
    // Publish the actual entry's incarnation before official startup can emit
    // SessionStart, including an immediately supplied first prompt.
    registerCurrentFrontend();
    const command = resolveOfficial(invocation.command);
    if (command.prefix.length) {
        process.argv = [process.execPath, command.prefix[0], ...invocation.args];
        await import(pathToFileURL(command.prefix[0]).href);
        return process.exitCode === undefined ? 0 : Number(process.exitCode);
    }
    return runOfficial(invocation);
}
function prepareHost(invocation, options) {
    if (classifyCodexInvocation(invocation.args) === 'passthrough')
        return;
    const file = options.configFile ?? configPath(), config = loadConfig(file);
    if (!startupEnabled(config))
        return;
    if (process.platform !== 'win32')
        throw new Error('The Codex HUD host requires native Windows');
    if (process.env.MZ_HUD_ORIGIN)
        throw new Error('Nested interactive Codex needs its own source pane; start it in another PowerShell tab/window');
    resolveOfficial(invocation.command);
    const configured = get(config, 'host.psmuxPath'), binary = typeof configured === 'string' ? effectiveBackendPath(configured) : '';
    if (!path.isAbsolute(binary) || !fs.statSync(binary).isFile())
        throw new Error('Configure host.psmuxPath with the verified portable psmux 3.4.0 executable');
    const version = execFileSync(binary, ['-V'], { encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 4096 });
    if (!verifyBackend(binary, version))
        throw new Error('This HUD host requires validated psmux 3.4.0 build 20aa1d7 or the packaged, checksum-verified compact backend');
    const id = randomUUID(), namespace = 'mzhud-' + id.replaceAll('-', ''), root = options.runtimeDir ?? path.join(path.dirname(path.resolve(file)), 'runtime'), hostDir = path.join(root, 'hosts'), dataDir = path.join(root, 'psmux', id);
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(hostDir, { recursive: true, mode: 0o700 });
    const hostConfig = path.join(dataDir, 'host.conf');
    fs.writeFileSync(hostConfig, 'set -g status off\nset -g warm off\nset -g exit-empty on\n', { flag: 'wx', mode: 0o600 });
    const env = { ...process.env };
    for (const key of Object.keys(env))
        if (/^TMUX|^PSMUX_/i.test(key))
            delete env[key];
    delete env.MZ_HUD_APP_SERVER_TOKEN;
    Object.assign(env, { MZ_HUD_ORIGIN: id, MZ_HUD_NAMESPACE: namespace, MZ_HUD_HOST_DIR: hostDir, MZ_HUD_PSMUX: binary, MZ_HUD_CONFIG_FILE: path.resolve(file), PSMUX_DATA_DIR: dataDir, PSMUX_CONFIG_FILE: hostConfig, PSMUX_NO_WARM: '1' });
    const entry = fileURLToPath(new URL('../bin/hud.mjs', import.meta.url)), encoded = Buffer.from(JSON.stringify(invocation)).toString('base64');
    return { binary, args: ['-L', namespace, '-f', hostConfig, 'new-session', '-s', 'codex', '-c', process.cwd(), '--', process.execPath, entry, 'host-owner', '--invocation64', encoded, '--config', path.resolve(file)], env, registered: path.join(hostDir, id + '.json') };
}
function fallbackNotice() { process.stderr.write('Codex HUD: startup unavailable; starting official Codex without HUD.\n'); }
export async function launchHostedCodex(invocation, options = {}) {
    if (!(options.interactive ?? (!!process.stdin.isTTY && !!process.stdout.isTTY)))
        return runOfficial(invocation);
    let prepared;
    try {
        prepared = prepareHost(invocation, options);
    }
    catch {
        fallbackNotice();
        return runOfficial(invocation);
    }
    if (!prepared)
        return runOfficial(invocation);
    let status;
    try {
        status = await foreground(prepared.binary, prepared.args, prepared.env);
    }
    catch (error) {
        // A spawn error proves that no backend process executed. A process exit does
        // not prove whether it started Codex and must never cause a second invocation.
        if (!(error instanceof ForegroundStartError))
            throw error;
        fallbackNotice();
        return runOfficial(invocation);
    }
    if (fs.existsSync(prepared.registered)) {
        const record = readHost(prepared.registered);
        if (record.state === 'closed' && typeof record.exitCode === 'number')
            return record.exitCode;
    }
    return status;
}
export async function runHostOwner(invocation, configFile = configPath()) {
    const origin = readHostOrigin(), proof = proveOwner(origin), record = registerHost(proof, origin.hostDir), config = loadConfig(configFile);
    let exitCode = 1;
    try {
        if (get(config, 'host.runtime') === 'localAppServer')
            process.stderr.write('Codex HUD: the 0.7.9 automatic App Server mode is retired for compatibility; using ordinary CLI.\n');
        if (startupEnabled(config)) {
            // A retry still verifies the exact slot: only an acknowledged viewer or a
            // successfully queried, definitively absent reported pane can be reused.
            for (let attempt = 0; attempt < 2; attempt++)
                try {
                    await ensureHostDisplay(readHost(record.file), config, { configFile });
                    break;
                }
                catch {
                    if (attempt === 1)
                        process.stderr.write('Codex HUD is not ready; inspect this host with hud doctor.\n');
                }
        }
        const command = resolveOfficial(invocation.command), entry = fileURLToPath(new URL('../bin/hud.mjs', import.meta.url)), encoded = Buffer.from(JSON.stringify(invocation)).toString('base64');
        exitCode = await foreground(command.prefix.length ? command.file : process.execPath, [entry, 'host-frontend', '--invocation64', encoded], { ...process.env, MZ_HUD_CONFIG_FILE: path.resolve(configFile) });
        return exitCode;
    }
    finally {
        closeHost(readHost(record.file), exitCode);
    }
}
