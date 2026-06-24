'use strict';
// scope-clear.js -- Claude Code "UserPromptSubmit" hook
// When you send the next prompt, you have engaged the session, so clear its
// attention marker (red light off). ASCII-only on purpose.

const fs = require('fs');
const path = require('path');
const os = require('os');

const ATTN_DIR = path.join(os.homedir(), '.claude', '.scope', 'attn');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; });
process.stdin.on('end', () => {
  let id = '';
  try {
    const j = JSON.parse(buf);
    id = j.session_id || j.sessionId || '';
  } catch (e) { /* ignore */ }
  if (id) {
    try { fs.unlinkSync(path.join(ATTN_DIR, id + '.attn')); } catch (e) { /* may not exist */ }
  }
  process.exit(0);
});
