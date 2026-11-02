# Validation: companion HUD with minimal autostart

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

## 0.2.1 audit fixes

All three audit findings were reproduced before changes. Canonical McpToolCall
and CommandExecution lifecycle events now update metadata-only activity and
deduplicate response records. Incremental reads validate hashed prefix/tail
checkpoints before retaining their offset, including growing in-place rewrites.
Config saves validate their exact serialized bytes before any replacement;
near-limit configs use compact JSON when needed, and oversized normalized
configs leave the original and backup state untouched. The suite passes 38 tests.
