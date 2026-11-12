/** Bounded overflow path: omit inline image bodies without trusting their JSON. */
export class ImageRecord {
    limit;
    parts = [];
    length = 0;
    quoted = false;
    escaped = false;
    unicode = 0;
    code = 0;
    probe;
    imageKey = false;
    imageValue = false;
    candidate = false;
    prefix = '';
    matched = 0;
    skipping = false;
    images = 0;
    failed = false;
    constructor(limit) {
        this.limit = limit;
    }
    fail() { this.failed = true; this.parts = []; this.prefix = ''; this.probe = undefined; }
    append(value) {
        if (this.failed || !value)
            return;
        this.length += value.length;
        if (this.length > this.limit) {
            this.fail();
            return;
        }
        this.parts.push(value);
    }
    write(chunk) {
        if (this.failed)
            return;
        let start = 0;
        for (let i = 0; i < chunk.length; i++) {
            const c = chunk[i], hidden = this.quoted && (this.candidate || this.skipping);
            if (hidden) {
                this.append(chunk.slice(start, i));
                start = i + 1;
                if (this.failed)
                    return;
            }
            if (!this.quoted) {
                if (c === '"') {
                    this.quoted = true;
                    this.probe = '"';
                    this.candidate = this.imageValue;
                    this.prefix = '';
                    this.matched = 0;
                    this.imageValue = false;
                    this.imageKey = false;
                }
                else if (!/\s/.test(c)) {
                    this.imageValue = c === ':' && this.imageKey;
                    this.imageKey = false;
                }
                continue;
            }
            // Only a short complete token can name image_url; never retain an image here.
            if (this.probe !== undefined)
                this.probe = this.probe.length < 128 ? this.probe + c : undefined;
            let decoded;
            if (this.unicode) {
                if (!/^[0-9a-f]$/i.test(c)) {
                    this.fail();
                    return;
                }
                this.code = this.code * 16 + Number.parseInt(c, 16);
                if (!--this.unicode)
                    decoded = String.fromCharCode(this.code);
            }
            else if (this.escaped) {
                this.escaped = false;
                if (c === 'u') {
                    this.unicode = 4;
                    this.code = 0;
                }
                else {
                    const escapes = { '"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t' };
                    decoded = escapes[c];
                    if (decoded === undefined) {
                        this.fail();
                        return;
                    }
                }
            }
            else if (c === '\\')
                this.escaped = true;
            else if (c === '"') {
                if (hidden)
                    this.append(this.prefix + '"');
                this.quoted = false;
                this.candidate = false;
                this.skipping = false;
                this.prefix = '';
                this.imageKey = false;
                if (this.probe !== undefined) {
                    try {
                        this.imageKey = JSON.parse(this.probe) === 'image_url';
                    }
                    catch { /* Final JSON.parse validates the retained structure. */ }
                }
                this.probe = undefined;
                continue;
            }
            else if (c.charCodeAt(0) < 32) {
                this.fail();
                return;
            }
            else
                decoded = c;
            if (this.candidate) {
                this.prefix += c;
                if (decoded !== undefined) {
                    if (decoded === 'data:image/'[this.matched]) {
                        if (++this.matched === 11) {
                            this.prefix = '';
                            this.candidate = false;
                            this.skipping = true;
                            this.images++;
                        }
                    }
                    else {
                        this.append(this.prefix);
                        this.prefix = '';
                        this.candidate = false;
                    }
                }
            }
        }
        this.append(chunk.slice(start));
    }
    finish() { return !this.failed && !this.quoted && this.images > 0 ? this.parts.join('') : undefined; }
}
