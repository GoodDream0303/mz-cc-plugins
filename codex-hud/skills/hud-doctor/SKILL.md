---
name: hud-doctor
description: Use when the Codex HUD does not start, remains unbound, cannot read a session, or has configuration and dependency errors.
---

Resolve the plugin root two directories above this skill folder. Run `node "<plugin-root>/bin/hud.mjs" doctor` and inspect the specific error. If the CLI is unbuilt, install locked dependencies with `npm ci --ignore-scripts`, then `npm run build` in the plugin root.

Distinguish dependency detection from live binding. Finding Node, Codex and wt.exe does not prove that a SessionStart hook is trusted or fired. Check the selected launch metadata and Codex `/hooks`; do not bypass trust or edit unrelated config.

Use `once --session <full-ID>` for read-only telemetry inspection and `demo` for a nonbillable Terminal preview. Preserve the session ID when investigating stale data. MCP configured/called/unknown indicators are not online counts.

Never kill Codex to close its HUD. `stop --launch <ID>` only stops the HUD display. Do not send a model request just to test readiness.

