# Validation: passive companion HUD 0.2.0

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
