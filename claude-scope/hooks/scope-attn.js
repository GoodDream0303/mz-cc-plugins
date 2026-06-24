'use strict';
// scope-attn.js -- Claude Code "Notification" hook
// Reads the hook JSON from stdin, extracts session_id, and writes an
// attention marker so the overlay shows a red light ("needs you").
// ASCII-only on purpose to avoid any encoding issues across shells.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Shared marker dir, fixed regardless of how this hook is installed (standalone exe
// next to .runtime, or as a Claude Code plugin whose ${CLAUDE_PLUGIN_ROOT} changes per version).
const ATTN_DIR = path.join(os.homedir(), '.claude', '.scope', 'attn');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; });
process.stdin.on('end', () => {
  let id = '';
  let msg = '';
  try {
    const j = JSON.parse(buf);
    id = j.session_id || j.sessionId || '';
    msg = String(j.message || '');
  } catch (e) { /* ignore malformed input */ }
  if (!id) { process.exit(0); }
  // 只在"需要你操作"(等待授权/回答)时亮红灯;普通空闲提醒("waiting for your input")不算 ATTN
  var idle = /waiting for your input/i.test(msg);
  try {
    fs.mkdirSync(ATTN_DIR, { recursive: true });
    // 轻量日志:记录每次通知文案与是否标红,便于核对过滤是否正确
    fs.appendFileSync(path.join(ATTN_DIR, '..', 'notif.log'),
      new Date().toISOString() + ' | attn=' + (!idle) + ' | ' + msg.replace(/\s+/g, ' ').slice(0, 120) + '\n');
  } catch (e) { /* best effort */ }
  if (idle) { process.exit(0); }
  try {
    fs.writeFileSync(path.join(ATTN_DIR, id + '.attn'), String(Date.now()), 'utf8');
  } catch (e) { /* best effort */ }
  process.exit(0);
});
