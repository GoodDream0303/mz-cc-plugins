# Friendly Tool Labels Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this single task.

**Goal:** Show the five approved tool actions in the HUD's selected language.
**Architecture:** Translate the display name in render.ts, after grouping by raw
tool identity and before existing sanitization/truncation. Preserve the snapshot.
**Tech Stack:** TypeScript, Node 20+, existing node:test renderer tests.
**Spec:** ../specs/2026-11-04-hud-tool-labels-design.md (approved in conversation).

## Global Constraints

Preserve counts, status, expiry, limits and unknown original names. No changes to
terminal interaction or startup, no clipboard access, dependencies or new options.

## Review Focus

Namespaced core aliases must resolve without matching unrelated MCP suffixes.
Identical visible labels must not merge distinct raw identities. Translation must
precede cell-width truncation; caller-owned metadata must remain unchanged.

### Task 1: Localized rendering and verification

**Files:** src/render.ts, test/render.test.mjs, test/agent-display.test.mjs,
scripts/smoke-host.mjs and README.md under codex-hud/; regenerate dist/render.js.
**Interfaces:** render(snapshot,config,options) keeps its existing signature.

- [x] Add renderer regressions for all five labels in en/zh-Hans/zh-Hant, known
  namespace aliases, unknown/MCP names, raw grouping, truncation and immutability.
  Run `node --test test/render.test.mjs test/agent-display.test.mjs`; observe the
  approved labels fail against the current renderer.
- [x] Implement the fixed label mapping within rendering, then run the same tests
  and require all to pass. Update native smoke expectations to the English labels.
- [x] Run npm test, Node20 renderer checks and the affected native smoke. Request
  one read-only review and document the results. Release through the authorized
  formal Git source and refresh the verified active HUD after committing.

## Verification evidence

- Renderer/agent display: 33/33 on Node24 and 33/33 on Node20.19.0. Approved label
  assertions failed before implementation and passed afterwards.
- Full `npm test`: 232/233. The demo-isolation test reported Windows Terminal
  missing during its unchanged 1500 ms `where.exe wt.exe` probe. The same test
  passed 1/1 in isolation (1.4 seconds for the complete test); Windows Terminal
  resolves from the existing WindowsApps path. No startup code was changed.
- One independent read-only review: no Critical, Important or minor findings.
- Production-backend native smoke: 16 checks passed, including live friendly
  command labels with running/completed/cancelled states, dynamic height, exact
  viewer respawn and Ctrl+C/q behavior. Report:
  `C:/Users/mzzhu2/AppData/Local/Temp/hud-production-host-3My6sR/summary.json`.
- The current baseline's terminal input, clipboard behavior, host lifecycle and
  startup files remain unchanged. Formal release follows this verified commit.
