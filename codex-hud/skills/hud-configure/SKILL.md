---
name: hud-configure
description: Use when the user wants to choose HUD fields, layout, colors, presets, or import claude-hud display preferences.
---

Resolve the plugin root two directories above this skill folder; call `node "<plugin-root>/bin/hud.mjs"`.

For specific changes, inspect `config show`, apply `config set <dotted-key> <JSON-value>`, and verify the resulting config. Preserve unrelated values. The HUD reloads valid changes automatically.

For a browsable menu, run `configure` in an interactive Windows Terminal, not a piped tool subprocess. Its preview, save and cancel actions operate separately from the Codex input pane.

For import, run `import-claude --path "<claude-hud-config.json>"` to show the mapping report; use `--yes` only when importing has been requested. Never import Claude settings.json, its env, statusLine shell commands, or credentials.

Default labels are English. Keep task/session names exactly as written. Some Claude-only fields have no Codex data: explain their unavailable status instead of inventing metrics. See [compatibility](../../docs/compatibility.md) for supported options.
