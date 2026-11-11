import { execFile } from 'node:child_process';
/** Bounded native query which does not block key, file or cancellation events. */
export function runText(file, args, options) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { ...options, encoding: 'utf8', windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
    });
}
