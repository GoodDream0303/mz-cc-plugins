---
name: hud-doctor
description: Use when the passive Codex HUD cannot open its pane, locate the selected session, or read configuration.
---

Resolve the plugin root two directories above this skill folder. Run
`node "<plugin-root>/bin/hud.mjs" doctor`. If unbuilt, run `npm ci --ignore-scripts`
and `npm run build` in that directory once.

Manual attachment needs no hooks; automatic opening uses the plugin SessionStart
hook. Doctor reports its enabled setting, local hook-file availability, last
result and unknown trust. Direct first-use trust review to native Codex /hooks;
never edit trust hashes, bypass trust, start another Codex, change daemon
settings or alter approval policies. Native statusline remains unchanged.

Inspect CODEX_THREAD_ID/CODEX_SESSION_ID or the explicitly supplied session ID.
Use `once --session <ID>` to read telemetry. Never choose another session to
hide missing data. Read failures should show stale valid data and retry.

Use `demo` for a nonbillable preview. `stop --launch <ID>` closes only the HUD.
