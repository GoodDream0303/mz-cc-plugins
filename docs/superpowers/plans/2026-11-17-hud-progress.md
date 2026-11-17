# HUD public progress implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; preserve the existing worktree and the user's scoped verification rules.

**Goal:** Implement the approved Progress row using public commentary and structured activity.
**Architecture:** Extend SessionReader/HudSnapshot, existing render groups and clock deadlines; reuse toolRows for safe labels.
**Tech stack:** Existing TypeScript/Node 20+, node:test, native Windows psmux.
**Spec:** `docs/superpowers/specs/2026-11-17-hud-progress-design.md`

## Constraints and review focus

- No runtime dependencies, extra model requests, transcript persistence, profile edits or automatic publishing.
- Preserve the existing `/side` fix and unrelated untracked files.
- Explicit commentary only; test reasoning/user/final/missing-phase exclusion.
- Test new-turn/terminal/rewrite clearing and old-plan/tool fallback isolation.
- Test old configuration order, hidden progress, Chinese/emoji width and clocks.

## Task 1: Read bounded public progress

Files: `codex-hud/src/types.ts`, `src/reader.ts`, `test/progress.test.mjs`.

- [x] Add failing tests for commentary sources, exclusions, bounded text and clearing.
- [x] Confirm the missing progress state produces the expected failures.
- [x] Add `progress?: {message?: string; step?: string}` to HudSnapshot and populate it only for the active turn.
- [x] Run reader/progress tests and rebuild dist.

## Task 2: Render and configure the row

Files: `src/render.ts`, `src/config.ts`, `src/menu-help.ts`, `src/display-deadline.ts`, corresponding dist and `test/progress.test.mjs`.

- [x] Add failing tests for priority, lifecycle labels, ordering, one-row truncation and clock visibility.
- [x] Implement the configuration toggle/color, translated help, renderer and current-turn deadline.
- [x] Run the affected reader/render/config/menu/deadline/pane-size test set.

## Task 3: Verify the running viewer and document scope

Files: `scripts/smoke-host.mjs`, `docs/compatibility.md`, `README.md`.

- [x] Add a synthetic native-host progress mode; verify real display updates and clearing without affecting the neighbor host.
- [x] Document the visible feature, its configuration and the actual evidence.
- [x] Review the complete diff; reuse the prior side-chat verification for its unchanged implementation.

No push, installation or release is included. Follow-up checks are limited to
affected behavior and concrete failures; do not restart unchanged full suites.
