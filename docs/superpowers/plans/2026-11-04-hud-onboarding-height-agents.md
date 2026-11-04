# HUD first use, live height and agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Guide fresh installations, correlate actual agent lifecycle metadata,
and fit verified HUD panes to changing content.

**Architecture:** Reuse the packaged hud-start/setup flow. Extend metadata-only
session reading for correlated agents. A live-height controller uses the existing
psmux origin/proof and renderer, keeping fixed sizing available.

**Tech Stack:** TypeScript, Node 20+, node:test, PowerShell 5/7, pinned psmux.

**Spec:** `docs/superpowers/specs/2026-11-04-hud-onboarding-height-agents-design.md`

## Global Constraints

- Native Windows; Node 20+; preserve official Codex and its statusline.
- Do not publish, reinstall, change live profiles, or submit model prompts.
- Resize only a verified HUD in its own source server/session/window.
- No prompts, completion bodies, credentials or raw tool results in HUD state.
- Preserve existing task names, unrelated settings/files, and manual fixed sizing.

## Review Focus

- A native Codex installation without Node must stop before Node-based doctor.
- Duplicate spawn records must not leave a call-ID ghost agent.
- A timed-out wait must not imply completion or overwrite reported state.
- A resized/small terminal must keep ten source rows and use wrapped content.
- An old viewer must not resize a replacement HUD or another live owner.

### Task 1: First-use onboarding

**Files:** `.codex-plugin/plugin.json`, `skills/hud-start/SKILL.md`, `README.md`,
`test/package.test.mjs`; clarify dynamic sizing in `skills/hud-configure/SKILL.md`.
**Interfaces:** Existing `bin/setup.ps1 -Enable` preview; `-Apply` changes only
authorized profiles/settings; manifest `onboardingSkill` names packaged hud-start.

- [x] Add a package test resolving manifest onboarding to a shipped SKILL.md.
- [x] Run `node --test test/package.test.mjs`; observe missing onboarding failure.
- [x] Register hud-start, cover missing Node before doctor and one-time profile
  initialization, and explain fresh dynamic-height opt-in without auto-deployment.
- [x] Run package tests, validate changed skill frontmatter, and evaluate its
  native/no-Node and already-configured scenarios independently.

### Task 2: Agent identity and lifecycle

**Files:** `src/reader.ts`, optional focused `src/agents.ts`, `src/render.ts`,
`src/cli.ts`, `src/menu-help.ts`, `test/reader.test.mjs`, `test/render.test.mjs`.
**Interfaces:** `HudSnapshot.agents` remains metadata `{id,name,status}`; canonical
spawn/activity/wait/close/resume events and legacy tool results update that list.

- [x] Add reader cases for spawn call-to-thread/path correlation, canonical
  final state, failure, close/resume, wait timeout and duplicate response ordering.
  Assert one agent, literal expected status, original name and absent secret text.
- [x] Run reader tests against baseline and observe identity/status failures.
- [x] Implement bounded metadata-only tracking and localized status labels.
- [x] Run reader/render tests and ensure unknown status renders as unreported.

### Task 3: Continuous content height

**Files:** `src/dynamic-height.ts`, `src/psmux.ts`, `src/cli.ts`, `src/config.ts`,
`src/menu-help.ts`, `test/dynamic-height.test.mjs`, `test/psmux.test.mjs`,
`scripts/smoke-host.mjs`, `README.md`, `docs/validation.md`.
**Interfaces:** `terminal.dynamicHeight: boolean`; a controller consumes a launch,
config, unpaginated rendered row count and clock, and resizes only its owned HUD.

- [x] Add tests for stable 3/6/3 transitions, shrink delay, ratio/source-space cap,
  fixed mode, wrong viewer/server/registration, wrap-driven growth and disable.
- [x] Run focused tests; observe missing controller and resize capability.
- [x] Implement guarded psmux resize and integrate the controller before render
  pagination. Register menu help and report resize failures without closing HUD.
- [x] Run focused tests; extend the existing synthetic backend smoke to check
  literal 3/6/3 geometry, source survival and an unchanged neighboring server.
- [x] Run `npm test` and the native smoke using the bundled checksum-pinned exe.
  Document executed evidence and remaining fresh-machine/real interaction limits.

### Task 4: Live tool activity (user-added requirement)

**Files:** `src/reader.ts`, `src/types.ts`, `src/render.ts`, reader/render tests.
**Interfaces:** Existing refresh loop and `HudSnapshot.tools`; add cancelled
status and correlate process/session IDs without storing command/result text.

- [x] Add failing incremental reader tests for explicit in-progress canonical
  events, yielded commands and final polls, cancellation and extension calls.
- [x] Add a rendering case where an older running build remains visible despite
  several newer completions under the configured display limit.
- [x] Respect canonical lifecycle status, correlate process IDs and polling, and
  prioritize active tools while retaining bounded recent history.
- [x] Run reader/render tests and inspect metadata from the current real session.

### Delivery

- [x] User-added agent model requirement: test resolved-model inheritance through
  lifecycle updates, preserve absence rather than guessing from requested/parent
  models, and render localized missing-model copy beside each agent.

- [x] Inspect the full diff and obtain one independent whole-change review.
- [x] Fix material findings with focused regressions, then run affected checks.
- [x] Report changes, evidence, and separate publication/installation scope.
