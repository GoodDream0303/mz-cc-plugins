// This file is also deployed on its own beside the stable PowerShell loader.
// Keep it independent of the versioned plugin and third-party dependencies.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
export function resolveOfficial(command) {
    const resolved = fs.realpathSync(command);
    if (path.extname(resolved).toLowerCase() === '.exe')
        return { file: resolved, prefix: [] };
    if (!['.ps1', '.cmd'].includes(path.extname(resolved).toLowerCase()))
        throw new Error('Unsupported official Codex launcher');
    const directory = path.dirname(resolved), root = path.join(directory, 'node_modules', '@openai', 'codex'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.codex;
    if (manifest.name !== '@openai/codex' || typeof entry !== 'string')
        throw new Error('Codex npm entry ownership is not established');
    const script = fs.realpathSync(path.resolve(root, entry)), relative = path.relative(fs.realpathSync(root), script);
    if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(script) !== '.js')
        throw new Error('Invalid official Codex npm entry');
    const adjacent = path.join(directory, 'node.exe');
    return { file: fs.existsSync(adjacent) ? adjacent : process.execPath, prefix: [script] };
}
function cacheIdentity(hint, home) {
    const root = path.resolve(path.dirname(hint), '..'), relative = path.relative(path.join(home, 'plugins', 'cache'), root), parts = relative.split(path.sep);
    if (parts.length !== 3 || parts.includes('..') || path.isAbsolute(relative)) {
        if (root.replaceAll('\\', '/').includes('/plugins/cache/'))
            throw new Error('HUD cache belongs to another Codex home');
        return;
    }
    if (!parts.slice(0, 2).every(part => /^[a-zA-Z0-9_-]+$/.test(part)) || parts[1] !== 'codex-hud')
        throw new Error('Invalid HUD cache identity');
    return { market: parts[0], name: parts[1] };
}
export function installedPluginId(hint, home) {
    const identity = cacheIdentity(hint, home);
    return identity ? identity.name + '@' + identity.market : undefined;
}
export function selectInstalledEntry(list, hint, home) {
    const identity = cacheIdentity(hint, home);
    if (!identity)
        return hint;
    const installed = list?.installed;
    if (!Array.isArray(installed))
        throw new Error('Installed plugin list is unavailable');
    const id = identity.name + '@' + identity.market, records = installed.filter(value => value?.pluginId === id);
    if (records.length !== 1)
        throw new Error('HUD installation is missing or ambiguous');
    const record = records[0];
    if (record.installed !== true || record.enabled !== true || record.name !== identity.name || record.marketplaceName !== identity.market)
        throw new Error('HUD installation is unavailable or disabled');
    if (typeof record.version !== 'string' || !(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(record.version) || record.version === 'local'))
        throw new Error('Invalid HUD installation version');
    const root = path.join(home, 'plugins', 'cache', identity.market, identity.name, record.version), cli = path.join(root, 'bin', 'hud.mjs');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
    if (manifest.name !== identity.name || record.version !== 'local' && manifest.version !== record.version)
        throw new Error('HUD package manifest identity does not match its installation');
    for (const file of [cli, path.join(root, 'dist', 'cli.js')])
        if (!fs.statSync(file).isFile())
            throw new Error('HUD package entry is missing');
    return cli;
}
async function main() {
    const mode = process.argv[2], encoded = process.argv[3];
    if (!encoded || encoded.length > 3 * 1024 * 1024)
        throw new Error('Invalid entry request');
    const request = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (typeof request.command !== 'string' || !path.isAbsolute(request.command))
        throw new Error('Invalid official command');
    const official = resolveOfficial(request.command);
    if (mode === 'official') {
        if (!Array.isArray(request.args) || !request.args.every((value) => typeof value === 'string' && !value.includes('\0')))
            throw new Error('Invalid official arguments');
        const child = spawn(official.file, [...official.prefix, ...request.args], { stdio: 'inherit', windowsHide: false });
        const interrupt = () => { };
        process.on('SIGINT', interrupt);
        try {
            process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1))); });
        }
        finally {
            process.off('SIGINT', interrupt);
        }
        return;
    }
    const home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
    if (request.pluginId !== undefined) {
        if (typeof request.pluginId !== 'string' || !/^codex-hud@[a-zA-Z0-9_-]+$/.test(request.pluginId))
            throw new Error('Invalid HUD plugin identity');
        request.hint = path.join(home, 'plugins/cache', request.pluginId.split('@')[1], 'codex-hud', 'active/bin/hud.mjs');
    }
    if (mode !== 'resolve' || typeof request.hint !== 'string' || !path.isAbsolute(request.hint))
        throw new Error('Invalid HUD entry request');
    let cli = request.hint;
    if (cacheIdentity(cli, home)) {
        const output = execFileSync(official.file, [...official.prefix, 'plugin', 'list', '--json'], { encoding: 'utf8', timeout: 4000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        cli = selectInstalledEntry(JSON.parse(output.replace(/^\uFEFF/, '')), cli, home);
    }
    // Preload the runtime before any process can launch a real session. A corrupt
    // import graph is a HUD failure, rather than a reason to block official Codex.
    await import(pathToFileURL(path.resolve(path.dirname(cli), '../dist/cli.js')).href);
    console.log(JSON.stringify({ cli }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    void main().catch(() => { console.error('Codex HUD: runtime unavailable; using official Codex.'); process.exitCode = 1; });
