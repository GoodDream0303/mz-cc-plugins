/** Decode executor metadata, never infer lifecycle from the command/result body. */
export function toolOutput(value) {
    const first = Array.isArray(value) ? value[0] : undefined;
    const raw = typeof value === 'string' ? value : typeof first?.text === 'string' ? first.text : undefined;
    let data = raw === undefined ? value : undefined;
    if (raw !== undefined) {
        try {
            data = JSON.parse(raw);
        }
        catch { /* Executor text uses a fixed header before its output body. */ }
    }
    const metadata = { data };
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (typeof data.exit_code === 'number' && Number.isFinite(data.exit_code))
            metadata.exitCode = data.exit_code;
        if (['string', 'number'].includes(typeof data.session_id))
            metadata.sessionId = String(data.session_id).slice(0, 200);
        if (['string', 'number'].includes(typeof data.cell_id))
            metadata.cellId = String(data.cell_id).slice(0, 200);
        return metadata;
    }
    if (!raw)
        return metadata;
    const lines = raw.slice(0, 4096).split(/\r?\n/), firstLine = lines[0];
    const running = /^Script running with cell ID ([a-zA-Z0-9_-]{1,200})$/.exec(firstLine);
    if (running) {
        metadata.status = 'running';
        metadata.cellId = running[1];
        return metadata;
    }
    if (firstLine === 'Script completed') {
        metadata.status = 'done';
        return metadata;
    }
    if (firstLine === 'Script failed') {
        metadata.status = 'failed';
        return metadata;
    }
    // Native exec_command/write_stdin expose process metadata before Final output.
    if (/^Chunk ID: [a-zA-Z0-9_-]+$/.test(firstLine))
        for (const line of lines.slice(1, 10)) {
            if (/^(?:Final output|Output):/.test(line))
                break;
            const pending = /^Process running with session ID ([a-zA-Z0-9_-]{1,200})$/.exec(line), exit = /^Process exited with code (-?\d+)$/.exec(line);
            if (pending) {
                metadata.sessionId = pending[1];
                metadata.status = 'running';
            }
            if (exit) {
                metadata.exitCode = Number(exit[1]);
                metadata.status = metadata.exitCode === 0 ? 'done' : 'failed';
            }
        }
    return metadata;
}
