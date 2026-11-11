import fs from 'node:fs';
import path from 'node:path';
function directoryStamp(directory) {
    try {
        const s = fs.statSync(directory, { bigint: true });
        return s.isDirectory() ? [s.dev, s.ino, s.birthtimeNs].join(':') : undefined;
    }
    catch {
        return;
    }
}
/** Owns only wakeups and filesystem hints. Readers still validate their inputs. */
export class RefreshEvents {
    factory;
    requested;
    pending = new Map();
    directories = new Map();
    wake;
    closed = false;
    constructor(factory = (dir, options, listener) => fs.watch(dir, options, listener), requested) {
        this.factory = factory;
        this.requested = requested;
    }
    request(reason, delayMs = 0) {
        if (this.closed || this.requested?.(reason) === false)
            return;
        const at = Date.now() + delayMs;
        this.pending.set(reason, Math.min(this.pending.get(reason) ?? Infinity, at));
        this.wake?.();
    }
    async wait(deadline) {
        for (;;) {
            const now = Date.now(), ready = new Set();
            for (const [reason, at] of this.pending)
                if (at <= now) {
                    ready.add(reason);
                    this.pending.delete(reason);
                }
            if (this.closed || ready.size || now >= deadline)
                return ready;
            const at = Math.min(deadline, ...this.pending.values());
            await new Promise(resolve => {
                let timer;
                const done = () => { if (timer)
                    clearTimeout(timer); this.wake = undefined; resolve(); };
                this.wake = done;
                if (Number.isFinite(at))
                    timer = setTimeout(done, Math.max(1, at - Date.now()));
            });
        }
    }
    watch(file, reason, recursive = false) {
        if (this.closed)
            return () => { };
        const directory = recursive ? path.resolve(file) : path.dirname(path.resolve(file)), key = directory + '\0' + recursive;
        let entry = this.directories.get(key);
        if (!entry) {
            entry = { path: directory, recursive, targets: new Set() };
            this.directories.set(key, entry);
        }
        const target = { file: recursive ? undefined : path.basename(file), reason };
        entry.targets.add(target);
        this.attach(entry);
        return () => { entry.targets.delete(target); if (!entry.targets.size) {
            entry.handle?.close();
            this.directories.delete(key);
        } };
    }
    attach(entry) {
        if (entry.handle || this.closed)
            return;
        const invalidate = () => { for (const target of entry.targets)
            this.request(target.reason); };
        try {
            const stamp = directoryStamp(entry.path);
            const handle = this.factory(entry.path, { recursive: entry.recursive }, (_event, name) => {
                for (const target of entry.targets)
                    if (name === null || target.file === undefined || String(name).toLowerCase() === target.file.toLowerCase())
                        this.request(target.reason, 25);
            });
            entry.handle = handle;
            entry.stamp = stamp;
            const lost = () => { if (entry.handle !== handle)
                return; entry.handle = undefined; handle.close(); invalidate(); };
            handle.on('error', lost);
            handle.on('close', lost);
        }
        catch {
            invalidate();
        }
    }
    reconcile() {
        for (const entry of this.directories.values()) {
            if (entry.handle && entry.stamp !== directoryStamp(entry.path)) {
                const previous = entry.handle;
                entry.handle = undefined;
                previous.close();
                for (const target of entry.targets)
                    this.request(target.reason);
            }
            this.attach(entry);
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const entry of this.directories.values()) {
            const handle = entry.handle;
            entry.handle = undefined;
            handle?.close();
        }
        this.directories.clear();
        this.pending.clear();
        this.wake?.();
    }
}
