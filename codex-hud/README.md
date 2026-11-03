# Codex HUD

An independent companion HUD for each simultaneously running Codex in PowerShell
WT tabs or separate PowerShell windows. The official CLI and native statusline
remain intact. UI is English; task names retain their original language.

> This checkout contains the unreleased 0.4.0 exact-host implementation. Installed
> 0.3.4 still has the WT MRU placement defect. Source tests and synthetic desktop
> checks do not establish real Codex trust/shared-daemon acceptance or deployment.

## How automatic pairing works

After one-time setup, keep typing `codex` normally. A PowerShell function opens a
unique psmux host inside that same tab/window and executes the verified official
npm JavaScript entry or native executable once, preserving the original argv.
Help, maintenance commands and non-TTY pipelines run without the terminal host.

Each source bootstrap opens its own waiting HUD before the first model turn.
Native SessionStart later binds that source's main CLI metadata. The hook verifies
the actual launched entry process incarnation, Codex ancestry, server/session,
source pane and viewer pane; thread ID or `%1` alone never establishes ownership.
Two frontends resuming the same conversation still have separate physical HUDs.

The backend does not use WT last/MRU, active tabs, titles, focus or newest logs.
Unproven/ambiguous shared-daemon origins are refused. Default shared-service
per-client propagation remains a real-acceptance gate; the plugin never adds
`--no-daemon` or security/trust bypasses to make a test pass. Administrator
Windows launches use the official CLI's own embedded behavior.

Closing a HUD keeps its Codex running. A later valid main start/resume can reopen
it. Source exit requests only its owned HUD to stop. Uncertain split outcomes
block duplicate creation until their exact process/pane can be established.

Existing ordinary PowerShell Codex processes cannot be moved retroactively into
psmux. Apply setup to future launches, then verify the actual multi-session flow.

## Installation and one-time PowerShell setup

Requires native Windows, Node 20+, and verified portable psmux **3.4.0 build
20aa1d7**. The fixed official ZIP SHA256 is
`a66b6be7c13c6fa0dc3660a267b9e34eaa91a4eb7f07fbd55a0468018bd0f721`.
See [the fixed release](https://github.com/psmux/psmux/releases/tag/v3.4.0).
No global PATH changes or automatic dependency installation are performed.

After the candidate has actually been published, use the formal marketplace:

```powershell
codex plugin marketplace add GoodDream0303/mz-cc-plugins
codex plugin marketplace upgrade mz-cc-plugins
codex plugin add codex-hud@mz-cc-plugins
```

Use the installed plugin's direct `node <plugin-root>/bin/hud.mjs` entry for the
following operations; the optional global npm link can target older source.
Do not silently replace the formal marketplace with a local installation.

1. Configure `host.psmuxPath` to the verified portable executable's absolute path.
2. From each PowerShell 5/7 shell, resolve `$PROFILE.CurrentUserCurrentHost`.
3. Preview `setup --profile <absolute-profile-path>`. Review the concrete block,
   then explicitly apply with the same command plus `--apply`.
4. Review/trust the current plugin SessionStart definition through native Codex
   `/hooks`. Do not edit trust hashes. The binding stage is synchronous and bounded.
5. Keep legacy `startup.enabled=false` while older sessions may still exist.
   Enable only the 0.4 override `host.autoStart=enabled` when setup is ready; older
   0.3.4 runtimes ignore it and remain paused. Its default `inherit` preserves
   existing preferences; `disabled` explicitly pauses the exact-host path.
6. Open new PowerShell tabs/windows and type `codex`; verify each real source.

Setup preserves existing profile content/encoding and refuses modified managed
blocks or conflicting functions/aliases. `setup --profile ... --remove --apply`
removes only its own verified block. Cache upgrades are checked against the
installed-version selection: an obsolete retained loader reports that setup must
be regenerated, rather than silently using old code. Deleted paths fail visibly.

No prompts, invocation arguments, command output, credentials or environment dumps
are persisted in HUD state. Bindings contain only allowlisted identity/lifecycle
metadata. Official Codex shims, approval/sandbox/daemon settings and WT settings
are unchanged. No automatic model request is made for setup or self-test.

## Commands and diagnostics

```powershell
node "<plugin-root>/bin/hud.mjs" doctor
node "<plugin-root>/bin/hud.mjs" start
node "<plugin-root>/bin/hud.mjs" setup --profile "<absolute-profile-path>"
node "<plugin-root>/bin/hud.mjs" config set host.psmuxPath '"C:/portable/psmux.exe"'
```

`start` reopens/reuses the HUD only from the current proven Codex host, with main
CLI provenance. `--session` must name that current conversation. A WT window name
cannot identify a pane, so `--window` and legacy `startup.window` no longer route
real attachments. The latter is preserved only for configuration compatibility.

`doctor` reports backend configuration, presence of origin metadata and the need
for live proof separately. `origin: present` is not a verified ownership claim.
`once --session <ID>` can inspect explicit telemetry, but is not a placed HUD.
`watch` remains available for manual rendering; `demo` uses an isolated preview.

The initial HUD height uses the exact source pane's geometry and configured
content. It runs only at creation; later wrapping/paging preserves manual resizing.
Use q/Ctrl+C to close the HUD, or `stop --launch <launch-id>` to request its exit.

## Source development

Run `npm ci --ignore-scripts`, `npm run build`, and `npm test` in `codex-hud/`.
Published packages include dist and the pinned TOML parser/license, without a
runtime build or node_modules requirement. Commit regenerated dist with source.
Daily changes are not automatically published or applied to user profiles.

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
node bin/hud.mjs demo
npm test
node scripts/smoke-host.mjs --psmux "C:/portable/psmux.exe"
node scripts/smoke-entry-gui.mjs --psmux "C:/portable/psmux.exe"
```

Both smoke scripts explicitly use synthetic CLI/telemetry fixtures. The desktop
script opens uniquely named temporary test windows and runs the real PowerShell
entry and production backend. Neither starts official Codex or requests a model.
See [validation](docs/validation.md) for actual evidence and remaining gates.

Remove the plugin with `codex plugin remove codex-hud@mz-cc-plugins` after removing
the authorized PowerShell loader blocks. Remove an explicitly installed global
npm link separately. User display configuration is retained.
