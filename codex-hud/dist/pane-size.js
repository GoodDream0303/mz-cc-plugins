import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { get } from './config.js';
import { render } from './render.js';
import { SessionReader } from './reader.js';
import { readEnvironment } from './environment.js';
function validViewport(view) {
    return !!view && Number.isInteger(view.columns) && Number.isInteger(view.rows) && view.columns >= 10 && view.columns <= 2000 && view.rows >= 10 && view.rows <= 1000;
}
export function measureTerminalViewport() {
    if (!process.env.WT_SESSION)
        return;
    if (process.stdout.isTTY && validViewport({ columns: process.stdout.columns, rows: process.stdout.rows }))
        return { columns: process.stdout.columns, rows: process.stdout.rows };
    if (process.platform !== 'win32')
        return;
    try {
        const helper = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/terminal-viewport.ps1');
        const view = JSON.parse(execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper], { encoding: 'utf8', windowsHide: true, timeout: 4000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^\uFEFF/, ''));
        if (validViewport(view))
            return view;
    }
    catch { /* Unknown viewport keeps the configured split; never infer another window. */ }
}
export function planInitialPaneSize(config, snapshot, viewport) {
    const fallback = { mode: 'ratio', fraction: get(config, 'terminal.paneSize') };
    if (!validViewport(viewport))
        return fallback;
    if (!get(config, 'terminal.autoHeight')) {
        const requested = get(config, 'terminal.initialRows');
        if (!requested)
            return fallback;
        const rows = Math.max(2, Math.min(requested, viewport.rows - 11));
        return { mode: 'rows', fraction: (rows + 1) / (viewport.rows + 1), rows, columns: viewport.columns, parentRows: viewport.rows };
    }
    const contentRows = render(snapshot, config, { width: viewport.columns, height: 10000, color: false }).totalLines;
    const cap = Math.min(fallback.fraction, (viewport.rows - Math.min(10, Math.floor(viewport.rows / 2)) - 1) / (viewport.rows + 1));
    // Account for the new pane's padding, splitter and character-cell rounding.
    const fraction = Math.min(cap, (contentRows + 2) / (viewport.rows + 1));
    return { mode: 'content', fraction, contentRows, columns: viewport.columns, parentRows: viewport.rows };
}
export async function initialPaneSize(config, options) {
    const fallback = { mode: 'ratio', fraction: get(config, 'terminal.paneSize') };
    if (!get(config, 'terminal.autoHeight') || options.window !== 'last' || !options.sessionId || !options.transcriptPath)
        return fallback;
    const viewport = (options.measure ?? measureTerminalViewport)();
    if (!validViewport(viewport))
        return fallback;
    try {
        const snapshot = await new SessionReader(options.transcriptPath, options.sessionId).read();
        if (snapshot.cwd)
            snapshot.environment = readEnvironment(snapshot.cwd, options.home);
        return planInitialPaneSize(config, snapshot, viewport);
    }
    catch {
        return fallback;
    }
}
