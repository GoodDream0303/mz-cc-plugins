# HUD boundary regression and manual recovery

> Execute inline with executing-plans and test-driven-development. Base a83fb7d. Latest user boundary: modify HUD only; do not modify or publish other plugins.

Evidence: new 0.7.9 remote TUI records are source=vscode/originator=codex-tui/thread_source=user; HUD and unchanged Scope filter them. Current viewer twice exited/0 without a reason; historical cause remains unknown. A temporary process identity failure reproduces viewer shutdown.

- [x] Withdraw the Scope draft completely; git diff ai-chat-scope is empty. Its 126-test draft run is diagnostic, not a shipped fix. Restore only HUD configuration host.runtime=cli for future startups, preserving other values and running jobs.
- [x] Retire automatic App Server/--remote rewriting in HUD, remove unused hosting module/helper/tests, and retain read-only legacy host proof/client for already running 0.7.9 sessions. A RED→GREEN test with saved localAppServer setting proves one frontend launch and original args.
- [x] Permit exact historical remote TUI metadata only after actual HUD host ancestry verification; retain IDE/subagent/unproven-host guards. Tests reproduce ignored vs opened before fix.
- [x] Keep viewer visible on transient source checks, invalidate MCP, suppress unverified resizing and retry. Fatal exits retain safe reason/code, never raw error text. Both behaviors RED→GREEN.
- [x] Separate hud-setup onboarding from hud-start manual reopening, keep CLI setup/start compatibility; no global alias/profile changes. Package onboarding misrouting reproduced before fix.
- [x] Full serial HUD tests, Node20/offline checks, one fresh read-only review. The earlier independent review found one Important cleanup issue; its RED→GREEN fix is included in the final runs below. Candidate patch 0.7.10 is not yet installed or published; original 0.7.9 cache/Scope files remain untouched. Current missing HUD is not claimed fixed by source-only tests.

Final verification, 2026-11-10:

- Node24.15.0: `npm --prefix codex-hud test -- --test-concurrency=1` rebuilt the shipped dist and passed 311/311, zero failures/skips. Evidence: `%TEMP%/hud-0710-resumed-full.log`.
- Node20.19.0: serial autostart, viewer-lifecycle, no-runtime-rewrite, mcp-live-integration, package, host-launch, host-session and config tests passed 62/62, zero failures/skips. Package coverage includes an isolated offline copy without source/node_modules/build tools. Evidence: `%TEMP%/hud-0710-resumed-node20.log`.
- Version 0.7.10 agrees across package/lock/root lock entry/manifest; onboarding resolves to shipped hud-setup; removed local-app-server dist is absent; `git diff --check` and unchanged Scope checks pass.
- hud-setup/hud-start simple frontmatter/name/description/TODO checks pass. The optional system `quick_validate.py` could not start because this Python lacks PyYAML; no dependency was installed and that validator is not claimed passed.
- No additional review was dispatched: the prior review and its single fix pass are complete, and the final suites now cover the cleanup fix. Real installed viewer stability, user-controlled legacy remote exit/resume, clear and new-machine acceptance remain pending. Publishing/reinstallation requires an explicit release request under repository AGENTS.md.

Running remote sessions cannot hot-migrate; users must finish and resume through ordinary CLI. Do not rewrite logs or stop their App Servers/jobs. Without an authoritative existing endpoint, MCP remains Unknown; do not change the CLI backend for a Connected label. Existing waiting sessions reopen from their own genuine tool context after patch installation, never guessed from another host.
