# Remove dedicated MCP features

> Execute inline with writing-plans, test-driven-development and verification-before-completion. User explicitly requested removal of MCP features, including the dedicated scheduling/call bar.

**Goal:** Remove MCP connection summaries, dedicated call rows, settings, polling and feature-only dependencies while retaining ordinary tool activity, exact legacy source attachment and the approved foreground-first startup work.

**Scope:** HUD only. Do not alter Codex, Scope, installed cache, user sessions, service state or profiles. Keep generic parsing of native tool events, timing, deduplication and private-payload exclusion. Legacy App Server ancestry proof remains solely for correctly attaching existing remote sessions; it does not connect to or start a service.

- [x] Reproduce the unwanted status/call rows and obsolete settings with tests using a legacy configuration; verify ordinary tools and canonical MCP tool events still appear through the general activity display.
- [x] Remove rendering and runtime polling, runtime-only types/verification/tests, dedicated configuration/help and unused server registries/configuration reads. Preserve generic tool timing and source compatibility.
- [x] Remove feature-only WebSocket/TOML dependencies, packaging script and bundled assets; update offline packaging checks and current documentation. Historical design/evidence documents remain historical.
- [x] Build and run focused rendering/configuration/reader/legacy-source/startup/package checks, then final full serial and Node20 affected/offline checks. Obtain one fresh review, fix concrete findings and verify HUD-only scope.
- [x] Leave source changes reviewable without automatic publication under repository AGENTS.md. Report installed-version and real UI verification limitations.

Completion means no dedicated MCP bars or runtime connection attempts, even with old saved MCP settings; general tool activity, startup optimization and legacy identity checks remain covered. Correct MCP protocol behavior belongs to Codex and is unaffected by removing HUD presentation.

## Verification

- RED: all three removal regressions failed against the previous implementation (dedicated rows, obsolete controls, MCP configuration reads).
- Focused Node24 checks: 154/154 passed, including renderer/reader/configuration, startup, legacy source proof and offline package.
- Final Node24.15.0 full serial build/test: 300/300 passed, zero failures/skips; `%TEMP%/hud-remove-mcp-full.log`.
- Final Node20.19.0 affected/offline/lifecycle coverage: 159/159 passed, zero failures/skips; `%TEMP%/hud-remove-mcp-node20.log`.
- Fresh independent read-only review found no Critical, Important or Minor issues. No second review or unchanged test rerun was needed.
- `git diff --check` passed; Scope/task-handoff have no tracked changes. Existing `task-handoff/scripts/__pycache__/` remains untouched.
- All 184 files in installed HUD0.7.11 still match the formal marketplace checkout. No publishing/reinstallation or real UI/whole-startup timing acceptance was performed; the withdrawal and foreground-first startup are source-only changes.

## Authorized release preparation

The user subsequently requested reinstallation. Candidate 0.7.12 contains this withdrawal and the preserved foreground-first startup. Package, root lock version, lock package version and plugin manifest agree. Node20 release package/removal/no-runtime-rewrite checks passed 10/10 after the version-only update. The previous 300/300 full and 159/159 Node20 behavior results remain applicable; no behavior code changed after them. Formal push/market refresh/official installation and real current-pane checks are the remaining release steps at this preparation point.
