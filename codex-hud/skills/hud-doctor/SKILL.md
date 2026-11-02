---
name: hud-doctor
description: Use when the passive Codex HUD cannot open its pane, locate the selected session, or read configuration.
---

Resolve the plugin root two directories above this skill folder. Run
`node "<plugin-root>/bin/hud.mjs" doctor`. If unbuilt, run `npm ci --ignore-scripts`
and `npm run build` in that directory once.

This HUD needs no hooks and does not replace statusline. Do not request /hooks
trust, start another Codex, change daemon settings, or alter approval policies.

Inspect CODEX_THREAD_ID/CODEX_SESSION_ID or the explicitly supplied session ID.
Use `once --session <ID>` to read telemetry. Never choose another session to
hide missing data. Read failures should show stale valid data and retry.

Use `demo` for a nonbillable preview. `stop --launch <ID>` closes only the HUD.
