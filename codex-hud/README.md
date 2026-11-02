# Codex HUD

A standalone, configurable multiline HUD for **native Windows Terminal**.
Codex runs in the upper pane; the HUD runs in the lower pane. This is a display
plugin, without task orchestration, auto-continue, or a custom Codex binary.

Labels, status messages, configuration menus, and diagnostics default to English.
Task/session names and project paths are preserved in their original language.

![Windows Terminal HUD preview](docs/hud-preview.png)

## Requirements

- Windows 10/11 with Windows Terminal (`wt.exe`) on PATH.
- Node.js 20+, npm, and an installed, authenticated Codex CLI.
- The local SessionStart plugin hook reviewed/trusted through Codex `/hooks`.
- Initial dependency installation/build; no runtime Python dependency.

## Build and run

From this directory:

```powershell
npm ci --ignore-scripts
npm run build
node .\bin\hud.mjs doctor
node .\bin\hud.mjs demo
```

`demo` opens a two-pane preview with synthetic telemetry and makes no model
request. It closes after two minutes; use `--duration 15000` for a shorter preview.

After plugin installation and hook review:

```powershell
node .\bin\hud.mjs start --cwd E:\YourProject
node .\bin\hud.mjs start --cwd E:\YourProject -- --model YOUR_MODEL
```

Each launch creates a separately named Terminal window. The normal `codex`
command stays unchanged. For exact hook environment propagation, the launched
Codex process uses `--no-daemon`; sandbox and approval policies remain unchanged.
The invoking shell environment is delivered over a one-use local pipe, never
stored in the launch file or printed. User arguments are encoded across the WT
command boundary and passed as literal argv to the original Codex.

Do not pass Codex `--remote`, `--cd`, or `--worktree` through this launcher:
remote hosts and changed working roots cannot safely use this local binding.
Use HUD `--cwd`, or watch an explicitly selected existing session.

## Install as a local Codex plugin

From the repository root:

```powershell
codex plugin marketplace add .
codex plugin add codex-hud@mz-codex-plugins
```

The Codex marketplace is `.agents/plugins/marketplace.json`; the existing
Claude marketplace and plugins are separate. A newly cached plugin may need
`npm ci --ignore-scripts` and `npm run build` in its own plugin directory.
The management skills explain this once-only setup.

Restart Codex to discover the plugin skills:
`$hud-start`, `$hud-configure`, and `$hud-doctor` (the UI may namespace them).
Open `/hooks` and review/trust the SessionStart hook. The HUD never automatically
trusts hooks or uses a bypass flag. An untrusted hook leaves a clear pending
binding message instead of choosing another session.

## Configuration

```powershell
node .\bin\hud.mjs configure
node .\bin\hud.mjs config show
node .\bin\hud.mjs config set display.showMcp true
node .\bin\hud.mjs config set display.showTools false
node .\bin\hud.mjs config set terminal.paneSize 0.25
node .\bin\hud.mjs import-claude
node .\bin\hud.mjs import-claude --yes
```

The interactive menu supports layout, display toggles, Git, colors, terminal
options, presets, preview, save and cancel. Arrays/objects are entered as JSON.
Choose Full, Essential or Minimal, or import existing claude-hud preferences.
An import preview explains equivalent, unavailable and unknown fields.

User configuration: `%LOCALAPPDATA%\mz-codex-hud\config.json`.
Use `--config FILE` for a separate explicit configuration. The first overwritten
configuration is backed up as `config.json.bak`; later saves preserve that backup.
A valid change reloads without restarting Codex. A malformed edit leaves the last
valid configuration active and displays an error.

The lower pane starts at 22% height. Drag its divider to resize. Narrow layouts
wrap; short layouts show pages. Use Left/Right or p/n to change pages and q to
close only the HUD. Use Windows Terminal's own pane-focus shortcuts to return
to Codex. Closing Codex ends its HUD; closing the HUD keeps Codex running.

## Existing sessions and diagnostics

```powershell
node .\bin\hud.mjs list
node .\bin\hud.mjs once --session FULL_SESSION_ID
node .\bin\hud.mjs once --session FULL_SESSION_ID --json
node .\bin\hud.mjs watch --session FULL_SESSION_ID
node .\bin\hud.mjs stop --launch LAUNCH_ID
```

Interactive watch can ask you to select a session. It never follows the newest
file automatically. Source telemetry comes from local Codex session files;
the current implementation does not read archived or paginated history stores.
See [field compatibility](docs/compatibility.md) for data availability.

Context uses the latest turn measurement, not cumulative tokens. Cached input
is a subset of input. Quota labels use actual window durations (a weekly primary
window is not mislabeled 5h). MCP displays configured/called/unknown facts, not
a guessed online count. Missing billing, cache expiry, speed, and Skills data
is not fabricated.

## Validation and removal

```powershell
npm test
powershell -NoProfile -File .\scripts\smoke-terminal.ps1
```

Remove the plugin with `codex plugin remove codex-hud@mz-codex-plugins`.
If a global CLI link was explicitly installed, remove it with
`npm uninstall -g mz-codex-hud`. User configuration is retained.
No cleanup command deletes Codex logs, changes credentials, or edits other
plugins, PowerShell profiles, or Windows Terminal settings.

