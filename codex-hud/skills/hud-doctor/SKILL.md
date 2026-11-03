---
name: hud-doctor
description: Use when the passive Codex HUD cannot open its pane, locate the selected session, or read configuration.
---

Resolve the plugin root two directories above this skill folder. Run
`node "<plugin-root>/bin/hud.mjs" doctor`. If Node is missing, use the
PowerShell-first `bin/setup.ps1` prerequisite report. Only build an explicitly
selected source checkout; a published package missing dist should be repaired
through the formal installation flow.

For an obsolete PowerShell entry after an upgrade, first distinguish a legacy
version-bound in-memory function from the stable initialized entry. Migrate the
legacy profile once with the active installed package's setup, then reload/open
that shell once. New stable profiles resolve the actual enabled installation on
each invocation and do not require setup after ordinary plugin upgrades.
For 0.5.1 to 0.5.2, refresh the copied bootstrap using setup from the active
installed package and reload the profile once. Inspect a failure stage/code in
the new notice; do not infer a timeout from a generic old fallback message.
Missing/disabled plugins, resolver/import errors and host preflight failures
allow official Codex to run without HUD. An official nonzero exit or backend
that may already have started Codex must never be retried as another session.
Do not remove caches, restart other live sessions or install a dependency as a
routine response; the target environment already supplies official Codex/Node.

Inspect `setup.prerequisites` for Node, platform, backend file/build/checksum,
official launcher and configuration status. `setup.ready` means these runtime
checks passed, not that a profile is loaded or a hook is trusted. A nonempty
`host.psmuxPath` alone does not establish readiness. Do not install a compiler
for an end user: the package carries the verified compact backend.

Manual attachment needs no hooks; automatic opening uses the plugin SessionStart
hook. Doctor reports its enabled setting, local hook-file availability, last
result and unknown trust. Direct first-use trust review to native Codex /hooks;
never edit trust hashes, bypass trust, start another Codex, change daemon
settings or alter approval policies. Native statusline remains unchanged.

Inspect CODEX_THREAD_ID/CODEX_SESSION_ID or the explicitly supplied session ID.
Use `once --session <ID>` to read telemetry. Never choose another session to
hide missing data. Read failures should show stale valid data and retry.

Use `demo` for a nonbillable preview. `stop --launch <ID>` closes only the HUD.
