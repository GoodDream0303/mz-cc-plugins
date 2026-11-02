# Validation: companion HUD with minimal autostart

## 0.3.4 independent conversations

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
