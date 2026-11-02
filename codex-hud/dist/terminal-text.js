const ESC = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-_])/g;
const ANSI = /(\x1b\[[0-9;]*m)/g;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function sanitize(value) { return String(value ?? '').replace(ESC, '').replace(/[\x00-\x1f\x7f-\x9f]/g, ''); }
function cellWidth(cluster) {
    if (/^[\p{Mark}\u200d\u200b\ufe0f]+$/u.test(cluster))
        return 0;
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\ufe0f/u.test(cluster))
        return 2;
    const n = cluster.codePointAt(0) ?? 0;
    return n >= 0x1100 && (n <= 0x115f || n === 0x2329 || n === 0x232a || (n >= 0x2e80 && n <= 0xa4cf && n !== 0x303f) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xfe10 && n <= 0xfe19) || (n >= 0xfe30 && n <= 0xfe6f) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || (n >= 0x20000 && n <= 0x3fffd)) ? 2 : 1;
}
export function displayWidth(value) { let width = 0; for (const { segment } of segmenter.segment(sanitize(value)))
    width += cellWidth(segment); return width; }
export function truncate(value, max) {
    const plain = sanitize(value);
    if (displayWidth(plain) <= max)
        return plain;
    if (max <= 0)
        return '';
    let out = '', width = 0;
    for (const { segment } of segmenter.segment(plain)) {
        const size = cellWidth(segment);
        if (width + size > Math.max(0, max - 1))
            break;
        out += segment;
        width += size;
    }
    return out + '…';
}
export function wrapAnsi(value, max) {
    const width = Math.max(1, max);
    let active = '';
    const lines = [];
    let line = [];
    let used = 0;
    const emit = (cells) => { while (cells.at(-1)?.text === ' ')
        cells.pop(); let out = '', style = ''; for (const cell of cells) {
        if (cell.style !== style) {
            if (style)
                out += '\x1b[0m';
            if (cell.style)
                out += cell.style;
            style = cell.style;
        }
        out += cell.text;
    } if (style)
        out += '\x1b[0m'; if (out)
        lines.push(out); };
    for (const part of value.split(ANSI)) {
        if (/^\x1b\[[0-9;]*m$/.test(part)) {
            active = part === '\x1b[0m' ? '' : part;
            continue;
        }
        for (const { segment } of segmenter.segment(part)) {
            const size = cellWidth(segment);
            if (size > width)
                continue;
            if (used + size > width) {
                let cut = -1;
                for (let i = line.length - 1; i >= 0; i--)
                    if (line[i].text === ' ') {
                        cut = i;
                        break;
                    }
                if (cut > 0) {
                    emit(line.slice(0, cut));
                    line = line.slice(cut + 1);
                    used = line.reduce((sum, cell) => sum + cell.width, 0);
                }
                else {
                    emit(line);
                    line = [];
                    used = 0;
                }
            }
            if (segment === ' ' && !line.length)
                continue;
            line.push({ text: segment, width: size, style: active });
            used += size;
        }
    }
    emit(line);
    return lines;
}
const colorNames = { dim: 2, red: 31, green: 32, yellow: 33, magenta: 35, cyan: 36, brightBlue: 94, brightMagenta: 95 };
export function colorize(value, color, enabled) {
    const safe = sanitize(value);
    if (!enabled)
        return safe;
    let code;
    if (typeof color === 'number' && color >= 0 && color <= 255)
        code = '38;5;' + color;
    if (typeof color === 'string') {
        if (color in colorNames)
            code = String(colorNames[color]);
        else if (/^#[a-f0-9]{6}$/i.test(color))
            code = '38;2;' + [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(';');
    }
    return code ? '\x1b[' + code + 'm' + safe + '\x1b[0m' : safe;
}
