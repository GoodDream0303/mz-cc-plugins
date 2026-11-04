# Codex HUD

An independent companion HUD for each simultaneously running Codex in PowerShell
WT tabs or separate PowerShell windows. The official CLI and native statusline
remain intact. Menus support English, Simplified Chinese and Traditional Chinese;
task names retain their original language.

> Version 0.6.0 adds guided first-use setup, optional continuous content height,
> correlated agent lifecycle and actual model labels, and live tool status.
> Existing fixed/manual sizing is preserved; enable `terminal.dynamicHeight`
> in Configuration → Terminal to fit content continuously. Existing PowerShell
> loaders select the new installed runtime on the next ordinary Codex launch;
> running viewers keep their loaded code until reopened.
>
> Version 0.5.2 limits startup metadata lookup to this plugin's configured
> marketplace, avoiding delays from unrelated markets. Fallback notices include
> a safe failure stage/code without logging invocation arguments or credentials.
> For an existing 0.5.1 setup, refresh the copied bootstrap once with the installed
> 0.5.2 setup and reload the profile. A marketplace package upgrade alone cannot
> replace bootstrap files outside its cache; daily launch commands stay unchanged.
>
> Version 0.5.1 adds stable PowerShell startup across plugin upgrades and safe
> fallback to official Codex when HUD preflight fails. Existing version-bound
> profiles need one setup migration and shell reload; ordinary later upgrades
> keep the normal `codex` and `codex resume` commands without repeated setup.
>
> Version 0.5.0 includes a checksum-pinned compact terminal backend, six-row initial
> sizing, separate quota-window controls and prerequisite-gated first-run setup.
> See [validation](docs/validation.md) for tested scope and remaining real-session
> checks. Existing running processes keep their loaded backend until a new host
> starts. Older 0.3.4 runtimes retain the WT MRU placement defect.

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

The target environment already has official Codex and Node 20+. Keep using
`codex` and `codex resume <ID>`; no replacement launch command is introduced.
After marketplace installation, ask the installed `hud-start` skill to guide the
one-time initialization for the PowerShell hosts you use. Existing ordinary
Codex processes keep running; initialization applies to subsequent launches.

Requires native Windows x64 and Node 20+. Packages with the compact backend include
`backend/psmux.exe`, its pinned checksum manifest and upstream license. Fresh
configuration selects that verified bundled backend automatically. Existing
explicit backend paths are preserved. The compact backend removes the dedicated
horizontal separator row; **Alt + drag** on the source pane's underlined last row
resizes it, while ordinary selection keeps working.

The original portable psmux **3.4.0 build 20aa1d7** remains supported as an explicit
alternative, with its original separator row and drag behavior. Its fixed ZIP
SHA256 is
`a66b6be7c13c6fa0dc3660a267b9e34eaa91a4eb7f07fbd55a0468018bd0f721`.
See [the fixed release](https://github.com/psmux/psmux/releases/tag/v3.4.0).
No global PATH changes or automatic dependency installation are performed.

The marketplace's **Set up** action opens the packaged `hud-start` onboarding
skill. It checks prerequisites, previews the one-time changes, guides native hook
review and keeps the normal `codex` / `codex resume` commands. An existing plain
Codex process must be resumed from a newly initialized shell to gain its HUD host.

Native Codex does not require a separately callable Node runtime. This HUD does:
use an existing Node 20+ executable, or choose an official Node LTS installation
or portable runtime during onboarding. No compiler, Rust toolchain or manual
package build is required. Missing Node is reported before Node-based diagnostics.

Installing the package alone does not change PowerShell profiles. Initialization
uses the existing Node runtime; an explicit portable executable can also be
selected. The bundled backend and shipped runtime need no Rust, npm install or build.
Run the PowerShell-first setup entry separately from each PS5/PS7 host you use:

```powershell
# Preview the concrete profile block, settings changes and runtime prerequisites.
& "<plugin-root>/bin/setup.ps1" -Enable
# After reviewing that preview, apply the same setup.
& "<plugin-root>/bin/setup.ps1" -Enable -Apply
```

Use `-NodePath "C:/tools/node/node.exe"` if Node is not on PATH. Setup checks its
version before invoking JavaScript; the generated entry makes that pinned runtime
available to its child hooks and restores the parent shell PATH after Codex exits.
`-ProfilePath` and `-ConfigPath` can explicitly select destinations. Default setup
is a dry run. Applying initialization refuses missing/unsupported prerequisites
before writing either file; `-Enable` opts into exact-host startup and pauses the
legacy startup flag. Setup does not launch Codex or submit a model prompt.
For a source checkout without the bundled binary, or to retain the original
backend explicitly, supply `-PsmuxPath "C:/tools/psmux/psmux.exe"` after verifying
the upstream archive. A compact replacement must also match the package's pinned
artifact checksum.

Doctor now reports `setup.prerequisites`, missing actions and their next steps.
Its `setup.ready` means runtime prerequisites passed, not that a profile was loaded
or a native hook was trusted. Review the installed hook through `/hooks`, open a
new PowerShell session and verify real interaction after setup. Legacy direct
`setup --profile ...` is profile-only; use `--initialize` for prerequisite-gated
initialization, with optional `--psmux` and `--enable`.

Use the formal marketplace:

```powershell
codex plugin marketplace add GoodDream0303/mz-cc-plugins
codex plugin marketplace upgrade mz-cc-plugins
codex plugin add codex-hud@mz-cc-plugins
```

Use the installed plugin's direct `node <plugin-root>/bin/hud.mjs` entry for the
following operations; the optional global npm link can target older source.
Do not silently replace the formal marketplace with a local installation.

1. Keep the verified bundled `host.psmuxPath`, or explicitly select a supported
   portable executable's absolute path.
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
removes only its own verified block. Initialization deploys a small PowerShell
loader and a standalone resolver beside the selected configuration, outside the
versioned cache. A cached installation's profile stores its plugin identity,
rather than its current version path. Each invocation discovers the official
command again and queries its bounded `plugin list --json` output to select the
actual installed, enabled package. Residual cache directories are not authority.

When migrating from a version-bound profile, apply initialization once and open
a new PowerShell or reload its profile once. Other already-open shells cannot
have their old in-memory functions replaced remotely. After this migration, a
plugin upgrade or deletion of its old cache needs no repeated setup or profile
reload. Existing Codex/HUD processes still keep their loaded runtime.
This applies to selection of the versioned runtime. A fix to the copied bootstrap
itself, including 0.5.1 to 0.5.2, needs a one-time setup refresh; reload its profile
to adopt changes to the PowerShell function as well.

Disabled/uninstalled plugins, unavailable metadata, corrupt runtime imports,
invalid settings and backend preflight failures print a short notice and start
official Codex without the HUD. Literal arguments, input and exit status are
preserved through the existing Node runtime. Even a missing/corrupt resolver has
an independent official-launch fallback; if Node itself is unavailable, the
external official command is invoked using PowerShell's normal semantics. A
deleted loader leaves the original external `codex` command visible on profile
load. Official errors and nonzero exits are never retried. If a started backend
may already have executed Codex, its result is propagated rather than risking a
duplicate session. An OS spawn failure proves the backend did not execute and
can fall back safely.

Saved backend paths inside this plugin's versioned `backend/psmux.exe` directory
are package-managed and follow the current verified bundled artifact at runtime;
the saved configuration need not be rewritten. Explicit portable backend paths
outside that directory are retained. The active backend remains checksum-checked.

No prompts, invocation arguments, command output, credentials or environment dumps
are persisted in HUD state. Bindings contain only allowlisted identity/lifecycle
metadata. Official Codex shims, approval/sandbox/daemon settings and WT settings
are unchanged. No automatic model request is made for setup or self-test.

## Commands and diagnostics

The interactive configuration menu follows `language`: `en` (default),
`zh-Hans` (Simplified Chinese) or `zh-Hant` (Traditional Chinese). Open **1 Layout**,
then **1 Language**, and enter `zh-Hans` to switch the draft menu immediately.
Choose **s Save** to persist it or **q Cancel** to leave the saved configuration
unchanged. The same language setting controls HUD labels; task names and custom
text stay exactly as written.

Each option includes an input example and an explanation of its effect. Selecting
an option shows its allowed values or range before editing. Enter keeps a text or
numeric value unchanged; `""` explicitly clears a text value. Long sections show
eight options per page: enter **n** for the next page or **p** for the previous
page, then press Enter. First/last-page boundaries show a message. Editing keeps
the current page open; an empty response returns to the main menu. **v** previews
from either menu; **s** saves and **q** cancels from either menu. Option numbers
remain stable across pages. Unavailable and inactive compatibility fields are
hidden; their existing saved values remain untouched.

Quota display has a master switch and separate **5-hour quota** / **7-day quota**
switches. Both windows are enabled by default, with zero display thresholds.
Each label comes from the recorded window duration, not primary/secondary order.
Only windows actually supplied by Codex telemetry are shown; absent windows
have no placeholder. Explicit existing switches/thresholds remain in
effect; the weekly default change does not overwrite saved preferences.

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

The default initial HUD height is six visible rows (`terminal.initialRows = 6`).
Small terminals reduce that target to preserve room for Codex. Enable
`terminal.autoHeight` to fit content instead, or use `initialRows = 0` with
auto-height disabled to use the percentage limit. Initial sizing runs at creation.
For continuous fitting, enable `terminal.dynamicHeight` in Configuration →
Terminal. Three content rows then occupy three HUD rows, six occupy six, including
wrapped lines and warnings. The pane ratio limits growth and ten source rows are
reserved; overflow stays paged. Growth waits one stable refresh and shrinking
waits at least two seconds to avoid flicker. With this option off (the compatibility
default), later wrapping/paging preserves manual sizing; with it on, content
fitting resumes after a manual drag. Additional internal panes or changed host
identity stop automatic resizing and leave the existing size in place.
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
Agent entries correlate spawn calls with actual thread IDs or task paths and
follow reported start, run, interrupt, complete, fail, close and resume events.
Completed spawn/wait tools alone do not mean an agent finished. Missing lifecycle
metadata is shown as `status not reported`; prompt and result bodies are discarded.
Each agent also shows its reported actual model. The requested or parent model
does not override resolved spawn/activity metadata; absent data is displayed as
`model not reported`. Later completion updates keep the last reported model.
Tool activity refreshes from the same incremental log reader (every second by
default). Running calls stay visible ahead of recent completions; yielded command
sessions remain running until a final process/poll result. Symbols distinguish
running `◐`, completed `✓`, failed `✗` and cancelled `⊘`. Reported events determine
status; unavailable runtime events are not invented from command output text.
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
