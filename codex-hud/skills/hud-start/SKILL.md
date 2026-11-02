---
name: hud-start
description: Use when the user wants the configurable multiline HUD beside an existing Codex session in Windows Terminal.
---

Resolve the plugin root two directories above this skill folder. The entry is
`bin/hud.mjs`. If unbuilt, run `npm ci --ignore-scripts` then `npm run build`
in that plugin root once.

Autostart normally opens the pane through the plugin SessionStart hook. If the
user asks for manual attachment, run `node "<plugin-root>/bin/hud.mjs" start`
from the current Codex tool environment. It consumes CODEX_THREAD_ID (or
CODEX_SESSION_ID) and adds only the HUD pane. Never start another Codex, modify
statusline, or bypass trust. First-use autostart requires the user to review the
plugin hook in native Codex /hooks; manual attachment does not require it.

For an explicit existing session use `start --session <ID>`. If there is no
current ID, ask the user to select one; never guess the latest log. For multiple
Terminal windows use an explicit `--window <ID-or-name>` when known; otherwise
Windows Terminal targets its most recently active window.

Model/effort/directory/session-name fields are off by default. Preserve the
original language of task names and use English for normal UI labels.
