# Validation

Validated on Windows with Node.js 24.15.0 and Codex CLI 0.166.0.

- HUD TypeScript build and 32 tests passed.
- The original isolated checkout's 19 task-handoff tests passed. Concurrent,
  uncommitted task-handoff work in the primary checkout is outside this change.
- A real Windows Terminal preview displayed English telemetry in a lower pane,
  retained an original Chinese task title, and closed both owned panes after
  the preview runner exited. The preview made no model request.
- Interactive menu tests exercised preview, save, and cancel. The tool host
  denied creation of a native test PTY, so those input/output tests used an
  isolated child-process terminal adapter.
- All three plugin skills passed the bundled skill validator, using an isolated
  temporary Python environment rather than adding dependencies to system Python.
- Native Codex marketplace installation/discovery was verified in a separate
  CODEX_HOME. The installed plugin was reported as enabled.
- A real local session was rendered read-only with the user's imported display
  preferences. Context, cumulative tokens, and a weekly-only quota were observed.

## Review fixes

An independent review found three issues. Each received a regression test:

1. Temporary log failures now retain the previous valid snapshot and retry the
   same reader instead of becoming permanently stuck in discovery.
2. The original Codex executable is resolved using the received invoking-shell
   environment, including Windows Path casing, rather than the Terminal host's
   potentially different PATH.
3. Doctor and launch preflight distinguish observable installation, build and
   hook-configuration problems. They never infer hook trust from file presence.

CLI help formatting was also corrected and checked through its actual output.

## Implementation choices

- The launcher uses an isolated --no-daemon Codex process so child-specific hook
  environment markers remain reliable; it does not alter approval or sandbox
  policy. This costs sharing the normal background daemon for that launched UI.
- An owned named Terminal window provides deterministic pane/session ownership.
- Unavailable Claude-only metrics remain explicit rather than estimated.
- All task/session names are preserved; UI defaults are English.

## Remaining verification boundaries

The first real Codex hook trust review belongs to the user through /hooks. The
application never changes trust hashes or uses a bypass flag. Restart the Codex
session after reviewing the hook. No paid model-call smoke test was performed.

The independent review did not repeat the separate UI, installation, or live
telemetry checks. Cross-user Windows named-pipe ACL behavior has not been tested.

Optional recursive deletion of the temporary skill-validation virtualenv was
rejected by execution policy. That isolated environment remains under the
Windows temporary directory. Existing source plugins and Claude configuration
were not modified by this feature.
