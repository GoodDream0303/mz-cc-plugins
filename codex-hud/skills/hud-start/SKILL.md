---
name: hud-start
description: Use when the user wants to open Codex with the configurable multiline Windows Terminal HUD.
---

Resolve the plugin root two directories above this skill folder. The CLI is `bin/hud.mjs`.

Ensure it is built once: if `dist/cli.js` or its dependencies are missing, run `npm ci --ignore-scripts` and `npm run build` in the plugin root. Do not reinstall dependencies on every invocation.

Run `node "<plugin-root>/bin/hud.mjs" doctor`, then `node "<plugin-root>/bin/hud.mjs" start --cwd "<requested-project>"`. Preserve explicitly requested Codex arguments after `--`; do not add approval/sandbox bypasses.

The launcher opens a dedicated Windows Terminal window with Codex above and HUD below. Original `codex` is unchanged. Exact session binding uses the plugin SessionStart hook and an isolated `--no-daemon` CLI process. If binding is pending, direct the user to review/trust this hook in Codex `/hooks`; never trust it by editing hashes or using bypass flags.

Use `demo` for a nonbillable layout preview. For an existing session, use `list` and `watch --session <full-ID>`; never silently follow the latest log or start a replacement chat.
