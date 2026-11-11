# Validation: exact per-source HUD

## 0.7.0: agent task rows and tool status summaries — 2026-11-04

Agents now render independently, including original task name, latest structured
plan step/running tool, actual model, elapsed current task time and child-thread
cumulative reported tokens (Σ). This is cumulative across that child's turns,
not this task's incremental/billable tokens or the parent's usage. Missing
metrics remain explicitly unavailable. Completed time freezes, running work
has priority within the retained 64-entry metadata budget, and reported terminal
entries age out after 60 seconds (at most two terminal rows). Unknown end times
remain bounded without an invented age. The default row limit is three;
display.agentsMaxVisible=0 shows all retained active entries through the pager.

Tools group recent retained calls by full name and status. Running groups have
priority and success, failure and cancellation counts remain distinct. Other
display groups retain their layout; agent rows stay separate even in compact
layouts. No dialogue/body extraction or additional model/service request is used.

Final npm test passed 222/222 on Node 24.15.0. The related Node 20.19.0 scope
passed 80/80. Native synthetic production-backend smoke passed 16 checks,
including child structured action and child-only cumulative tokens. Current real
child logs also supplied separate task duration and cumulative usage. Independent
review's stale-turn, frozen-end, interruption, retained-active and resume timing
findings received failing regressions before correction and focused rechecks.

## 0.6.3: completed-agent model recovery — 2026-11-04

The live reinspection found completed parent entries without their historical
model metadata, although exact matching child logs reported the actual model.
The child probe now also fills such missing models for terminal entries, while
preserving their completed/closed/failed state. It still checks exact child ID
and recorded parent; active-state timing checks are unchanged. Two regressions
failed before the correction. Final `npm test` passed 209/209 on Node 24.15.0.

## 0.6.2: copy-safe input, transient pager and child lifecycle — 2026-11-04

Ctrl+C previously exited the viewer; the native regression reproduced that
failure before removing only its close binding. A Ctrl+C byte now keeps the
viewer alive and updating, while q closes only its own viewer. This does not
claim OS clipboard/selection acceptance, which remains a terminal interaction.

The pager is hidden only while verified automatic growth is pending. Content
still stays within the actual viewport, warnings remain visible, and capped
overflow retains the pager. Native smoke observes both the pending frame and
the capped frame rather than checking only their final geometry.

The real hud_demo_2 worker completed while its parent missed the completed
activity/delivery. Reading its exact child ID and recorded parent relationship
confirmed task_complete. The supplemental reader reconciles such active agents
from verified child lifecycle/model metadata, comparing against the latest task
start/resume time. It rejects wrong parents, ambiguous logs and old completions.
Ordinary messages and replayed notifications do not imply a new task or advance
the lifecycle threshold. Discovery errors keep the viewer alive with a short
metadata warning; no message body or agent-service API is used.

[Native evidence](evidence/2026-11-04-copy-pagination/summary.json) records 15
passing synthetic production-backend checks. Independent review's ordinary-message
and replay timing findings received failing regressions before correction; the
focused follow-up found no remaining issue.
Final `npm test` passed 207/207 on Node 24.15.0; the related Node 20.19.0 scope
passed 67/67. OS clipboard contents were not inspected or changed.

## 0.6.1: reopening a live host after package-cache replacement — 2026-11-04

The actual formal 0.5.2 -> 0.6.0 update removed the old cache while this Codex
source remained alive. Its registered origin still named that removed backend;
the installed 0.6.0 `start --dry-run` reproduced ENOENT. The new client now uses
the existing package-managed backend resolver for command execution, preserving
the immutable origin/proof, exact endpoint and all ownership checks. Explicit
portable paths and paths outside the current Codex home's HUD cache stay explicit.

The development CLI then passed `start --dry-run` against the same real source.
The patch's full `npm test` run passed 193/193 on Node 24.15.0.
`smoke-host.mjs --dynamic-height --obsolete-backend` passed 13 native synthetic
checks, including an absent old package backend path, independent sources,
live 3/6/3 height, tool transitions and agent model retention. The narrow fix was
independently reviewed without a remaining finding. This does not claim a new
real model session or complete fresh-machine acceptance.

## 0.6.0: onboarding, live height and activity — 2026-11-04

The following implementation checks preceded publication. No live profile
initialization, marketplace deployment or additional official Codex/model
session was performed for these checks; installation is verified separately.

- Node 24.15.0: final `npm test` passed 193/193, including generated runtime,
  PS5/PS7 startup/package regressions and all new feature checks.
- Node 20.19.0: 95/95 related reader/render, live-height, backend, configuration,
  package, first-run setup and prerequisite checks passed on the final runtime.
- [Native smoke evidence](evidence/2026-11-04-live-height/summary.json): all 12
  checks passed using the pinned compact backend and synthetic CLI/telemetry.
  The same viewer followed 3/6/3 actual content rows, grew to seven after width
  reduction, and preserved its neighbor. Disabling fitting preserved its height.
  New log records updated running/completed/cancelled tool symbols and agent
  lifecycle/model labels without restarting that viewer.
- Read-only inspection of the existing real parent transcript confirmed two
  completed agents with the reported `gpt-6.1-sol` and `gpt-6-astra` models. An
  actual code-mode yielded cell was decoded as running and reconciled to done
  after its wait. This is metadata evidence, not fresh-machine/visual acceptance.
- Independent review found pending/canonical agent identity duplication, replayed
  spawn state regression and unhandled executor output envelopes. Each received
  a failing regression before correction. Follow-up review confirmed the three
  Important findings resolved. Its missing-model fallback finding was also
  reproduced and corrected without overwriting canonical model/state.
- The packaged onboarding target resolves to hud-start. Its native-Codex/no-Node
  and configured-host/reopen scenarios were independently evaluated. Both changed
  skills pass the skill validator. Existing isolated PS5/PS7 package/setup checks
  still apply; these do not prove a full fresh Windows installation.

Full fresh-machine marketplace setup, native hook review and real user acceptance
of continuous resizing remain manual checks. Existing fixed/manual sizing is the
compatibility default; `terminal.dynamicHeight=true` explicitly opts in. The
one-second default refresh follows reported metadata and cannot show events the
upstream runtime has not emitted.

## 0.5.2 marketplace lookup correction — 2026-11-03

- Node 24 full suite: 163/163 passed. Node 20.19.0 startup/package scope: 23/23
  passed, including hidden real PS5/PS7 consoles with genuine TTY handles.
- A synthetic slow unrelated marketplace reproduced the old fallback; the scoped
  `plugin list --marketplace <configured-name> --json` lookup selects the HUD
  without waiting for unrelated markets. A real read-only comparison measured
  335 ms scoped versus 6528 ms unfiltered, returning the same installed HUD.
- Resolution failures carry only an allowlisted stage and errno, which the loader
  includes in its notice. Invocation arguments, credentials and raw subprocess
  output are not written to diagnostics.
- The reported real launch was confirmed to have used the inline official
  fallback with no registered host. Its original exception was suppressed by
  0.5.1, so the exact original cause cannot be reconstructed; the timing comparison
  alone is not proof that this particular launch timed out.
- One read-only review identified deployment of copied bootstrap files as an
  upgrade requirement. The 0.5.2 instructions explicitly require one setup refresh
  and profile reload for this bootstrap fix; package-only upgrade does not update
  those files. Ordinary versioned runtime selection remains unchanged.

These checks do not create a real model session. Actual user cold-start/resume
acceptance remains separate from fake CLI console checks and package validation.

## 0.5.1 transparent startup validation — 2026-11-03

- Node 24 full suite: 161/161 passed. Node 20.19.0 resolver, entry, host-fallback
  and package/setup compatibility scope: 21/21 passed.
- The first Node 20 run had a Windows executable deletion failure in fixture
  teardown (18/19); runtime assertions passed. Test cleanup now retries transient
  filesystem errors with a fixed bound, and the final compatibility run is green.
- One independent whole-change review found an unvalidated `bin/hud.mjs` launch
  path. The fix was reproduced RED, then verified on PS5/PS7 with both syntax and
  startup exceptions. The resolver now runs the actual session-free entry check
  before selecting that package; arbitrary session exits are still never retried.
- A real read-only installation lookup exceeded the initial four-second budget
  (4.285 seconds), causing safe but unnecessary fallback. The bounded lookup
  budget is now eight seconds, with a 4.2-second synthetic regression. The final
  real installed-runtime lookup and entry check passed in 4.202 seconds. This
  metadata query adds startup latency; it does not launch a model session.

The stable loader and standalone resolver are deployed by setup outside versioned
caches. PS5/PS7 fixtures verify that one loaded function follows an actual
installation change after deletion of its previous cache. Higher residual
versions, disabled/uninstalled plugins and invalid package identity do not win
over official installation metadata. The official command is resolved again
after its installation path changes.

Isolated fixtures cover damaged configuration, missing backend, corrupt plugin
imports, deleted/corrupt resolver, missing bootstrap, literal/empty/quoted PS5
arguments, pipeline input and official exit status. A separate native fixture
checks that loss of Node does not block a native official executable. Backend
preflight failures fall back, but a launched backend's nonzero exit is not
retried as a second session. Package-managed backend paths follow the current
bundle; external portable paths remain explicit.

These tests use fake official launchers and isolated profiles/configurations.
They do not start a real model, reinstall the marketplace package, rewrite the
live profiles or validate Hook trust. Full fresh-Windows marketplace installation
and real terminal interaction remain manual acceptance checks. Version 0.5.0
does not include these startup changes; they are introduced in 0.5.1.

## Compact backend, six-row defaults and first-run setup — 2026-11-03

[Current evidence](evidence/2026-11-03-compact/summary.json) belongs to the bundled
`3.4.0-hud-compact-v1` artifact pinned in `backend/psmux-compact.json`.
It replaces the separator row with a text-preserving underline, reports the same
viewport used for drawing when status is off, and synchronizes changed PTY sizes
during a compact drag. Normal source builds retain upstream behavior.

- Plugin checks: Node 24 full suite 146/146; Node 20 package/setup scope 14/14.
- Backend: compact production-path/renderer tests 25/25; normal focused tests
  12/12. The full upstream normal run had 5128 passes, eight failures and two
  ignored cases. Six failures recovered with neutral configuration; untouched
  Bash-path and debug flood-timing cases remain outside the completed scope.
- Native process checks passed eight cases, including six-row creation,
  zero separator geometry, exact resizing after viewport changes, concurrent
  physical owners, scoped close/reopen and recovery after a killed viewer.
- Desktop fixtures passed PS5/PS7, same-window tabs, separate windows and native
  left/right splits. Background sources kept the neighbour's geometry/focus.
  Representative screenshots are included with the evidence.
- A copied package without src/node_modules initialized isolated profiles using
  its real bundled backend, without Rust or an explicit backend path. Missing
  Node/backend/official launcher and invalid configuration are reported before
  applying initialization. Native hook trust remains explicitly unknown.

All CLI/data in native fixtures was synthetic; no additional official Codex or
model prompt was started. Automatic mouse injection did not reliably trigger the
gesture and is not counted as a pointer-interaction pass. Physical Alt-drag on the
final fixture was manually accepted: the footer remains adjacent during movement
and after release. Real-session acceptance after formal installation remains
separate. The current live Codex processes and formal installed plugin were not
replaced.

## 0.4.0 installed live inspection — 2026-11-03

[Live inspection results](evidence/2026-11-03-live/summary.json) cover existing
official Codex processes on the inspected Windows machine. This inspection did
not start another Codex or submit a model prompt. It used the installed 0.4.0 CLI,
live process-incarnation checks and scoped psmux pane queries.

- The installed package and manifest report 0.4.0. PowerShell 5/7 setup previews
  both report `changed: false`. The three sampled source/cache entry and runtime
  files match after CRLF/LF normalization; this is not a complete package audit.
- All eight registered running hosts have a live official npm Codex native child
  of the registered frontend, verified owner/server ancestry and a separate live
  HUD pane in that exact server/session/window. Four HUDs are already bound to
  valid main CLI transcripts; four are waiting for conversation metadata. Their
  earlier hook dispatch and first-turn ordering were not replayed by this check.
- The current tool environment passes `start --dry-run`, including exact physical
  ownership and main-conversation provenance. Two real `start` calls both report
  `HUD already-open.`; all eight launch/viewer identities, session bindings and
  owner/HUD geometry remain unchanged, and all heartbeats advance.
- Closing only the proven current HUD establishes its old pane's exact absence.
  The registered source processes survive. `start` opens a new live HUD bound to
  the same current thread; the other seven launch/viewer identities, bindings and
  pane geometry remain unchanged.
- Exact-host autostart is enabled; legacy `startup.enabled` remains false. Doctor
  reports valid configuration and `already-open`, but hook trust is still reported
  as `unknown`. No trust, profile, approval or daemon settings were changed.

This establishes live pairing, current-session reuse and scoped close/reopen for
the observed process topology. It does not establish visual placement, focus,
keyboard/mouse/scroll/copy, statusline usability, cold-start/upgrade behavior or
per-client attribution through a different shared-daemon topology. Those checks
remain open. User interaction feedback was requested but is not yet available.

## Source and synthetic results recorded before installation

## 0.4.0 candidate — source verified, not deployed

The following historical checks preceded the installed live inspection above.
At that point the candidate was not installed and user profiles/configuration
were unchanged. The goal remains **every simultaneously running real Codex has an
independent, correctly paired HUD**; neither these synthetic checks nor the
limited live inspection mark the full acceptance goal complete.

- Node 24: `npm test`, 100/100 passed on the final runtime tree.
- Node 20.19.0: all 100 tests passed against the built runtime. Its portable ZIP
  was checked against the official Node SHASUMS256 file before execution; no global
  Node installation or PATH change was made.
- Package copy without src/node_modules: doctor, quiet hook, setup and the actual
  generated ASCII loader work from a Unicode path through PS5/PS7. Literal argv,
  empty strings, pipeline input and official exit status are preserved.
- One independent code review found five actionable issues: daemon-descendant
  false attribution, missing CLI aliases/maintenance verbs, profile marker suffix
  execution, retained obsolete cache entry, and manual subagent provenance. Each
  was reproduced RED and corrected with regression coverage; no second review is
  claimed for the fix pass.

### Native process and desktop fixtures

[Archived evidence](evidence/2026-11-03-host/manifest.json) includes checksums,
explicit scope/limitations, two summaries and five screenshots. It excludes
executables, private psmux keys, active registry files, invocation arguments and
real session content.

The final production-backend smoke passed six checks with a test-only preload
parking the first viewer before acknowledgement, making the intended crash phase
deterministic. An earlier unparked forced-kill run did not recover a waiting HUD;
it is retained as a failed experiment, not counted as passing evidence. The final
controlled check deliberately killed a
returned HUD pane **before acknowledgement**: recovery happened only after a
successful scoped pane listing proved that exact pane absent. Lost responses,
failed scope queries and still-present panes remain uncertain and do not trigger
another split.

The desktop entry smoke executed the actual PowerShell `codex` function and
production bootstrap in real WT tabs, separate PowerShell windows and a native
WT split. PS5/PS7 were both exercised. A20%/B70%, C35%/D65%, and L25%/R75% remained
correctly paired. B stayed selected while background A reopened its HUD; the
active right native neighbour retained its geometry/focus while L reopened.
All CLI/telemetry in these checks is **synthetic**: the codex.exe is an explicitly
renamed Node fixture, not official Codex. No model prompt was issued.

### Cold-start defect and correction

One earlier four-window run left D in a created/uncertain state. Its frontend
started 4.22 seconds after the display intent: the 4-second acknowledgement
budget could expire while sequential bounded process probes were still running.
A deterministic 4.2-second startup regression reproduced the failure. The final
code shares one identity snapshot per proof stage, allows an 8-second startup
acknowledgement, retains the reported pane ID, and retries only after exact absence
proof. The final six-source desktop run and killed-before-ack smoke passed.

The official entry now registers its own incarnation before executing the
unmodified official launcher, so an initial user prompt cannot race a parent's
asynchronous registration. That ordering has a consumer-side regression which
checks the registration before the first synthetic official-entry instruction.

### Legacy startup compatibility

`host.autoStart=enabled` explicitly enables the 0.4 exact-host path while
`startup.enabled=false` keeps older loaded 0.3.4 hooks paused. The default `inherit`
preserves prior preferences. A direct isolated probe of the installed 0.3.4 hook
confirmed it stays disabled with that new-only override enabled. No global user
configuration was changed by the probe.

### Remaining real acceptance gates

Native hook trust/review, actual official Codex environment inheritance and event
ordering, keyboard/mouse/scroll/copy, native statusline and deployed upgrade flow
still require real acceptance after authorized formal installation. Default shared
daemon per-client origin is unproven and conservatively rejected; ordinary daemon
environment inheritance is not accepted as proof. No --no-daemon or security/trust
override is injected to hide that gap. Existing ordinary sessions cannot be
retroactively moved into psmux.

## Historical results below

The older sections document then-current data/layout checks. In particular,
0.3.4's MRU physical routing was later demonstrated incorrect: those tests are not
proof that arbitrary existing tabs/panes receive the right HUD, and their manual
attachment instructions are superseded by the current README.

## 0.3.4 historical conversation-data checks

The user clarified that multiple distinct conversations must each have a HUD.
Deduplication already uses Codex home plus the exact thread identity, not a global
flag or working directory. Regression now checks four different conversations
in one directory/shared runtime, all opening independently and deduplicating only
their own repeated events. The missing `clear` and main-CLI `fork` source paths
were reproduced as ignored, then enabled in both the hook matcher and runtime.
Compact events and subagents remain excluded.

All 61 tests pass. `node scripts/smoke-multi-session.mjs` also passed with two
simultaneous synthetic Terminal windows, shared home/cwd/runtime, distinct exact
transcripts and viewer processes, same-conversation deduplication, and continued
second-HUD heartbeats after closing the first. The smoke uses explicit window
names to isolate its own windows; it does not claim the existing `last` default
can resolve arbitrary inactive tabs or focus changes. No Codex/model was started.

Codex processes started before plugin installation need one manual attachment
inside each existing conversation, or a restart/resume after loading and trusting
the hook. Startup hooks do not retrospectively replay those earlier start events.

## 0.3.3 content-aware initial height

The user selected initial fitting rather than ongoing pane resize. The exact
selected session is rendered at the verified parent console width; its wrapped
row count determines the initial fraction, with padding allowance and an owner
space limit. Fixed mode and unverified target geometry keep the configured ratio.

All 60 tests pass, including sizing, autostart wiring, explicit-window fallback,
field boundaries, empty activities, completed plans, and pinned warnings. The
packaged viewport helper was checked through both Windows PowerShell 5 and
PowerShell 7 against the actual Codex console. Independent code review found no
blockers; its dry-run reporting finding was fixed and checked in the window smoke.

`node scripts/smoke-initial-height.mjs <columns> <rows>` opens a synthetic owner
and HUD in an isolated Terminal window, starts no Codex/model session, waits for
the asynchronous layout to settle, checks both panes, then closes only its own
test processes. Measured results:

| Window | Content rows | HUD rows | Owner rows | Result |
|---|---:|---:|---:|---|
| 120 x 40 | 2 | 3 | 35 | PASS |
| 70 x 30 | 3 | 4 | 24 | PASS |

The visual UX audit used the user's screenshot and claude-hud 0.8.0 source.
Addressed: hidden stale warnings, mechanical context/quota wrapping with dangling
separators, and unknown-only rows / unclear completed plans. Remaining findings:

- P1: agent call IDs may not be linked to returned canonical identities, leaving
  historical agents unknown; confirm lifecycle metadata before changing status.
- P2: low-contrast dim statistics/task names need a separate foreground-color review.
- P2: normal-state paging/close/config help is not discoverable while Codex holds focus.
- P2: the configuration Display section has 58 unpaged options; group common and
  advanced controls. Claude's inline statusline layout itself cannot replace
  Windows Terminal pane focus/lifetime behavior.

## 0.3.2 Windows shell compatibility

The 0.3.1 Windows command used CMD-specific percent expansion. Replaying that
command through PowerShell 7 and Windows PowerShell 5 reproduced MODULE_NOT_FOUND
before the hook script could write diagnostics. Core session hook setup can pass
the selected environment shell, so the default COMSPEC runner is not sufficient
evidence of the actual session behavior.

Both command variants now let Node resolve PLUGIN_ROOT and convert the absolute
script path to a file URL. Regressions execute the installed command through CMD,
PowerShell 7, and Windows PowerShell 5; the PowerShell cases include plugin paths
with spaces and Unicode. The existing weekly-label assertion now matches `5h:`
as a label rather than rejecting the same substring inside a reset countdown.
Native startup/resume dispatch still requires validation after reviewing the
changed command in /hooks; hook trust is never edited by the implementation.

All 52 tests pass. A real Windows Terminal smoke test using the PowerShell 7
runner passed automatic pane opening, quiet stdout, repeated-event deduplication,
and independent HUD closure. Independent review reran all three shell regressions
and found no blocking issues.

## 0.3.1 marketplace distribution

The previous source-only Git package omitted dist/ and required a manual build
inside the installed cache. The release now tracks compiled modules and copies
the pinned smol-toml runtime with its BSD license, so a fresh installation needs
neither node_modules nor a build. A distribution regression copies only the
installable files to an isolated directory, runs doctor, and verifies the hook
entry remains quiet for an ignored event. The full suite passes 50 tests.

The Codex marketplace retains the repository's existing mz-cc-plugins name and
lists task-handoff alongside codex-hud. The development-only mz-codex-plugins
install should be removed before installing codex-hud@mz-cc-plugins from Git.
Native /hooks discovery and first-turn autostart still require user acceptance;
the packaging fix is not evidence that the earlier discovery issue is resolved.

A staged Git-only export was registered as a marketplace in an isolated
CODEX_HOME. Native `codex plugin add` installed 0.3.1, doctor succeeded from that
cache with no node_modules, and the catalog still exposed task-handoff 2.1.1.
Independent release review found no blocking issues.

Version 0.3.0 adds the user-selected asynchronous startup/resume hook. Manual
attachment stays independent of hooks. The native statusline and hidden identity
defaults remain unchanged. The original no-hook requirement below describes the
historical 0.2 implementation, superseded only for automatic startup triggering.

The follow-up user requirements replace the 0.1 launcher design. This version
attaches an existing Codex conversation and keeps native statusline untouched.
It has no hook registration/trust requirement, no Codex launcher, no daemon
setting, no environment relay and no session-ID display.

The regression suite covers current identity from CODEX_THREAD_ID or explicit
selection, hook-disabled startup, fixed session choice, native identity fields
off by default, exact telemetry, partial logs, recovery, Unicode wrapping,
English menus, save/cancel, configuration import and passive packaging.

The Windows Terminal preview uses synthetic telemetry with no model call. The
legacy isolated baseline of the existing task-handoff suite passed 19 tests;
concurrent edits to that plugin remain outside this feature.

Terminal attachment targets the most recently active window by default;
--window names a specific existing window. The HUD lifetime is user-controlled
through q/stop/pane close, rather than tied to a Codex-process watcher.

The previous temporary Python skill-validation environment remains in TEMP
because execution policy rejected recursive cleanup. No automatic memory files
were created or changed. User display preferences were updated only in the HUD
configuration as requested.

All 32 applicable tests passed. A real Windows Terminal attachment smoke test
verified reading the same existing session in an added pane, preservation of
the original owner pane, and independent HUD closure. Independent review found
a session-name fallback leaking an ID and an undocumented window override;
both were reproduced and corrected with regression tests.

## 0.3.0 automatic opening

The hook command was checked against the installed Codex 0.166.0 command-runner
source: native Windows defaults to COMSPEC /C, so commandWindows uses
%PLUGIN_ROOT%, while the Unix command uses ${PLUGIN_ROOT}.

Synthetic SessionStart input through that actual Windows command opened a real
Terminal pane, emitted no stdout, deduplicated a repeated event, and closed only
the HUD when requested. Unit tests cover main-thread metadata, disabled config,
compact/subagent/non-CLI skips, mismatched identity, concurrent opening,
failed-launch recovery and manual dry-run metadata not suppressing autostart.

The actual native Codex hook dispatch after trust remains the first-use boundary:
the user must review the hook in /hooks and restart. No trust hashes or bypass
flags are changed by setup or tests.

The 0.166.0 source dispatches pending SessionStart from session/turn.rs, so the
supported timing is the first turn after startup/resume, not guaranteed idle-TUI
opening. The request's hook_transcript_path returns the actual materialized
rollout path. Two-process abandoned-lock and delayed-heartbeat regressions now
pass: live owner liveness is authoritative, while immutable PID/nonce claims
avoid replacing or deleting a shared lock pathname. The suite passes 49 tests.

## 0.2.1 audit fixes

All three audit findings were reproduced before changes. Canonical McpToolCall
and CommandExecution lifecycle events now update metadata-only activity and
deduplicate response records. Incremental reads validate hashed prefix/tail
checkpoints before retaining their offset, including growing in-place rewrites.
Config saves validate their exact serialized bytes before any replacement;
near-limit configs use compact JSON when needed, and oversized normalized
configs leave the original and backup state untouched. The suite passes 38 tests.
