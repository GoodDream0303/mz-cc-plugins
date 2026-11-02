# Codex HUD

A configurable multiline companion pane for **native Windows Terminal**.
It attaches to an existing Codex session. The native statusline stays intact.

**Automatically opens on main Codex startup/resume through a minimal hook.**
No replacement statusline, new Codex session, daemon override or model request.

UI labels, menus and diagnostics default to English. Task/session names retain
their original language. Model, reasoning effort, directory and session-name
fields are off by default because Codex already shows them; their optional
display settings remain configurable.

![Windows Terminal HUD preview](docs/hud-preview.png)

## Build and attach

Requires Node.js 20+, npm and Windows Terminal on PATH.

```powershell
npm ci --ignore-scripts
npm run build
node ./bin/hud.mjs doctor
```

## Automatic opening (default)

After installing the plugin, open Codex `/hooks` and review/trust the **Codex HUD
SessionStart** hook. Exit and open Codex again after the first trust review.
Future main-session startups and resumes automatically add the companion pane
when Codex dispatches SessionStart. In Codex 0.166.0 this is on the first turn
path, so do not expect an idle, never-used TUI to split immediately on opening.

The hook is asynchronous and emits no stdout or model/developer context. It
uses the supplied transcript metadata, skips subagents/non-CLI/compact events,
and does not create a second display for an already open or pending session.
Manual attachment remains available without trusting hooks.

```powershell
mz-codex-hud.cmd config set startup.enabled false
mz-codex-hud.cmd config set startup.enabled true
mz-codex-hud.cmd config set startup.window last
```

Autostart targets the most recently active Terminal window by default. Set
`startup.window` to a known window ID/name when a fixed target is preferred.
Closing a HUD keeps Codex running; the next startup/resume may open it again.

From inside Codex, invoke `$hud-start` or run:

```powershell
mz-codex-hud.cmd start
```

The HUD uses `CODEX_THREAD_ID` supplied to Codex tool processes, falling back to
`CODEX_SESSION_ID`. It does not parse visible statusline text or guess the newest
conversation. No session ID is displayed by the HUD.

From an ordinary terminal without this environment, explicitly supply the ID
from the native statusline or use interactive selection:

```powershell
mz-codex-hud.cmd start --session YOUR_SESSION_ID
mz-codex-hud.cmd list
mz-codex-hud.cmd watch --session YOUR_SESSION_ID
```

`start` adds a lower pane to the most recently active Windows Terminal window.
With several windows, explicitly target a known window name/ID using `--window`.
It does not start or configure Codex, change security settings, or edit statusline.
Codex launch arguments after `--` are not accepted.

Close only the HUD with q, Ctrl+C, or `stop --launch LAUNCH_ID`. In passive mode,
closing Codex does not automatically close its companion pane. Close that pane
or the whole Terminal window normally.

## Local plugin installation

Build first, then from the repository root:

```powershell
codex plugin marketplace add .
codex plugin add codex-hud@mz-codex-plugins
```

The Codex marketplace is `.agents/plugins/marketplace.json`, separate from the
original Claude marketplace. The plugin registers one asynchronous SessionStart
hook for startup/resume only. Skills: `$hud-start`, `$hud-configure`, `$hud-doctor`.
If a fresh cache is unbuilt, run `npm ci --ignore-scripts` and `npm run build`
in its plugin directory once.

## Configuration

```powershell
mz-codex-hud.cmd configure
mz-codex-hud.cmd config show
mz-codex-hud.cmd config set display.showMcp true
mz-codex-hud.cmd config set display.showModel true
mz-codex-hud.cmd import-claude
mz-codex-hud.cmd import-claude --yes
```

Layout, presets, individual fields, Git, colors, ordering and pane size are
configurable. Minimal and Essential avoid repeating native identity fields.
Full explicitly enables all available fields. Import preserves explicit Claude
values and can therefore re-enable identity fields.

Config: `%LOCALAPPDATA%/mz-codex-hud/config.json`; `--config FILE` selects another
explicit file. Saves are validated, backed up and atomic. Valid edits hot-reload.
Use Left/Right or p/n for overflow pages; drag the pane divider to resize.

Context uses latest telemetry; cumulative/cache token counts remain distinct.
Quota labels use actual window durations. MCP reports configured/called/unknown
facts. Unavailable cost, speed, cache expiry and Skills data is never invented.
See [configuration compatibility](docs/compatibility.md).

## Preview and checks

```powershell
mz-codex-hud.cmd demo
npm test
powershell -NoProfile -File ./scripts/smoke-terminal.ps1
powershell -NoProfile -File ./scripts/smoke-autostart.ps1
```

The demo uses synthetic telemetry and makes no model request.
See [validation](docs/validation.md).

Remove the plugin with `codex plugin remove codex-hud@mz-codex-plugins`.
Remove an explicitly installed global link with `npm uninstall -g mz-codex-hud`.
User configuration is retained.
