---
name: hud-configure
description: Use when the user wants to choose HUD fields, layout, colors, presets, or import claude-hud display preferences.
---

Resolve the plugin root two directories above this skill folder; call `node "<plugin-root>/bin/hud.mjs"`.

For specific changes, inspect `config show`, apply `config set <dotted-key> <JSON-value>`, and verify the resulting config. Preserve unrelated values. The HUD reloads valid changes automatically.

For a browsable menu, run `configure` in an interactive Windows Terminal, not a piped tool subprocess. Its preview, save and cancel actions operate separately from the Codex input pane.

The menu follows `language`: `en`, `zh-Hans` or `zh-Hant`. Layout → Language
switches the draft immediately; Save persists it and Cancel discards it. Each
visible option has an input/effect example. In lists, n/p followed by Enter
changes page, v previews, s saves, q cancels, and empty Enter returns. Editing
retains the current page. Unavailable compatibility fields stay hidden.

Quota has a master switch plus independent five-hour/seven-day switches, both
enabled by default. Show only reported windows; do not add a five-hour placeholder
for a weekly-only account. Initial height defaults to `terminal.initialRows=6`;
explicit `terminal.autoHeight=true` opts into content fitting, while initialRows=0
with auto-height off selects percentage sizing. Those initial-sizing edits apply
at creation. The separate `terminal.dynamicHeight` switch enables continuous
content fitting in an already running verified host: three visible content rows
use three HUD rows and six use six, within the ratio cap and ten source rows.
Growth waits one stable refresh; shrinking waits at least two seconds. While on,
manual dragging is fitted again after the debounce. Turn it off to preserve
fixed/manual height. Keep existing sizing preferences unless a change is requested.

For import, run `import-claude --path "<claude-hud-config.json>"` to show the mapping report; use `--yes` only when importing has been requested. Never import Claude settings.json, its env, statusLine shell commands, or credentials.

Default language is English. Keep task/session names exactly as written. Some Claude-only fields have no Codex data: explain their unavailable status instead of inventing metrics. See [compatibility](../../docs/compatibility.md) for supported options.
