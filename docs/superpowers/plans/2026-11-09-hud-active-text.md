# HUD Active Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved foreground-only activity preview.
**Architecture:** Keep lifecycle data unchanged; carry status with agent display rows so rendering chooses the correct foreground. Render activity rows separately, with indentation applied after width-aware wrapping.
**Tech Stack:** TypeScript, Node.js test runner, ANSI terminal renderer.
**Spec:** `docs/superpowers/specs/2026-11-09-hud-active-text-design.md`

## Global Constraints

- Background and font weight remain unchanged; default active text is `#f2f2f2`, inactive text is `#9a9a9a`.
- Retain existing tool failure color, localization, activity limits, retention, metadata and pagination.
- Respect `color:false` and `NO_COLOR`; no publish, install or host changes.

## Review Focus

- Starting/running agents change emphasis when finished; unknown states are never treated as active.
- Wrapped agent lines retain indentation and correct ANSI styles without exceeding terminal width.
- Agent headings remain separate in expanded and compact layouts, with no added blank rows.
- Current and Recent tool summaries remain separate and failures retain their existing critical color.
- Existing custom colors and color-disabled output remain valid.

### Task 1: Activity rendering and verification

**Files:** Modify `codex-hud/src/agent-display.ts`, `src/render.ts`, `src/config.ts`, `test/agent-display.test.mjs`; rebuild corresponding dist files and update the README activity description.
**Interfaces:** `agentRows` returns status-bearing display rows for `render`; public render inputs and outputs stay unchanged.

- [x] Update existing agent layout assertions and add focused rendering coverage for activity transitions, localized headings, wrapping and color-disabled output.
- [x] Run `node --test --test-concurrency=1 test/render.test.mjs test/agent-display.test.mjs`; observe expected failures against existing dist.
- [x] Implement status-aware text colors and separate activity rows; build via `npm run build`.
- [x] Run the focused tests, then `npm test`; inspect output and changes.
- [x] Obtain a fresh review of this task's changes, resolve concrete findings, and commit only task files.

Validation: initial rendering baseline 33/33; expected RED observed for heading/layout and active text emphasis. The first full run identified missing menu help for the new color options; localized help was added and the affected menu checks passed. Final Node24 full suite 246/246, Node20 renderer/config/menu-help checks 51/51; fresh review and follow-up review reported no findings. Installation and live-host acceptance were not performed.
