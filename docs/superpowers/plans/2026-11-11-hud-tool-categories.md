# HUD Tool Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Show command/script operation categories and counts, with whole-major wrapping and no category folding.

**Architecture:** Classify bounded static input into fixed metadata, then aggregate only command/script calls by major, minor and status. Keep native lifecycle ingestion separate from display packing; render prepacked activity rows through the existing pager and height calculation.

**Tech Stack:** TypeScript, Node 20+, node:test, existing ANSI/Unicode helpers; no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-hud-tool-categories-design.md`

## Global Constraints

- Node 20+ and native Windows remain supported. Build checked-in dist.
- No new runtime dependency, configuration migration, background service or MCP special UI.
- No raw command, argument, path, script body or output retained in new metadata or display.
- No automatic version bump, release, push or reinstall.
- Preserve 60-second expiry, native lifecycle precedence, paging, height, three languages and NO_COLOR.

## Review Focus

- Quoted command-looking strings, comments and arbitrary script paths must not become executed actions.
- Wrapped commands and multiple operations must not silently reduce to PowerShell or the first operation.
- Canonical events arriving before or after response metadata must not duplicate counts or restart completed work.
- Low toolsMaxVisible and narrow panes must not hide command/script operation categories or orphan a minor label.
- Mixed success/failure/cancelled calls, ANSI colors and Unicode cell widths must remain correct after grouping.

---

### Task 1: Classify command and script operations

**Files:**
- Create: `codex-hud/src/command-details.ts`
- Modify: `codex-hud/src/types.ts`, `codex-hud/src/tool-details.ts`, `codex-hud/src/reader.ts`
- Test: `codex-hud/test/tool-details.test.mjs`, `codex-hud/test/reader.test.mjs`

**Interfaces:**
- Consumes: `ToolAction`, command arrays/strings, structured command_actions and core tool inputs.
- Produces: `commandDetails(command:unknown, actions?:unknown):ToolAction|undefined` and `scriptDetails(script:unknown):ToolAction|undefined`; exported through existing tool-details entry points. `ToolOperation` is a fixed operation union; mixed actions carry `operations:ToolOperation[]`.

- [x] Add literal fixtures for PowerShell -Command reads, multiline read/search, rg --files, npm/Node/Python tests, quoted decoys, unsupported scripts, and literal orchestration commands. Assert exact safe metadata and absence of secret strings.
- [x] Run `node --test --test-concurrency=1 test/tool-details.test.mjs test/reader.test.mjs`; confirm intended new assertions fail.
- [x] Implement bounded static classification, structured-action precedence, exact namespace matching and late metadata enrichment without lifecycle mutations.
- [x] Build and rerun the same tests; all pass, including existing script/MCP/agent privacy cases.
- [x] Commit only this task's source, generated dist and tests with a feature-specific message.

### Task 2: Aggregate categories and pack whole major groups

**Files:**
- Create: `codex-hud/src/tool-display.ts`, `codex-hud/test/tool-categories.test.mjs`
- Modify: `codex-hud/src/render.ts`, `codex-hud/test/render.test.mjs`, `codex-hud/test/agent-display.test.mjs`

**Interfaces:**
- Consumes: Task 1 metadata and existing `Tool` lifecycle fields.
- Produces: `toolRows(snapshot:HudSnapshot, config:Config, options:{width:number;now:number;color:boolean}):{text:string;indent?:number}[]`; render uses these activity rows without merging into other sections.

- [x] Add rendering tests with two reads plus a failed read: assert separate `Read ×2`/failed `Read ×1`, one command major, no target strings, no snapshot mutation.
- [x] Add measured-width fixtures: two majors share a wide row; a command major containing Environment moves whole at a narrower width; every minor stays visible even with toolsMaxVisible=1. Cover oversized groups with repeated major labels, Unicode and colored/plain equivalence.
- [x] Run `node --test --test-concurrency=1 test/tool-categories.test.mjs test/render.test.mjs test/agent-display.test.mjs`; confirm new behavior fails.
- [x] Implement category labels, logical-call deduplication, per-status aggregation, mixed-operation labels, whole-group packing and narrow fallback. Preserve unrelated tool behavior and existing expiry/timing semantics where compatible with aggregation.
- [x] Update prior per-call rendering assertions to the approved aggregated contract; build and run the three files plus dynamic-height/performance tests.
- [x] Commit task source, generated dist and tests with a feature-specific message.

### Task 3: Verify and document the completed feature

**Files:**
- Modify: `codex-hud/README.md`, this plan.

**Interfaces:**
- Consumes: Tasks 1–2, existing serial full-suite runner.
- Produces: Documented actual recognition limits, final checks and independent whole-change review.

- [x] Document the two levels, mixed calls, counts, no folding, whole-group wrapping, narrow fallback and unchanged generic MCP behavior.
- [x] Run `npm test -- --test-concurrency=1`, capture full output and inspect summary/failures; no skipped tests or increased timeouts.
- [x] Run relevant files with an available Node20 runtime if one is locally available; otherwise report that compatibility runtime check is unavailable without claiming it passed.
- [x] Dispatch one fresh-context reviewer on the change since f30659a, supplying spec, plan, Review Focus and recorded rulings. Fix concrete important defects with RED→GREEN checks; do not repeat unchanged full runs.
- [x] Check diff whitespace, final scope and generated dist. Record actual results and finish on feat/codex-hud without publishing or reinstalling.


## Implementation results

- Task 1: classification and native/late metadata tests ran RED, then build and
  tool-details/reader/render passed 80/80.
- Task 2: all seven new display tests ran RED, then category/render/agent/height/
  performance checks passed 61/61.
- One independent read-only review found six concrete boundary defects; all were
  reproduced RED and fixed: script filename inference, shell comments/stream
  routing, JS regex/conditional calls, structured native precedence, tiny CJK
  labels and individual generic timing. No deferred findings. A related quoted
  pattern regression also ran RED and was fixed without inspecting string
  contents as shell code.
- Final focused checks: 121/121. Final serial `npm test -- --test-concurrency=1`:
  330/330, zero failures/cancellations/skips, Node24.15.0. Earlier interim full
  runs were 323/323 and 329/329 before the corresponding additional regressions.
- Node20 runtime was not locally available; the new feature was not executed on
  Node20. Existing historical Node20 results do not establish this feature's
  compatibility. No new APIs beyond the existing Node20 floor were introduced.
- Unicode/ANSI, three languages, NO_COLOR, paging/height and offline-package
  coverage are included in the final suite. Real installed-HUD acceptance is
  pending; the active 0.7.13 cache and saved configuration were not modified.
- Implementation stays on feat/codex-hud. No version bump, push, release,
  reinstall, source rewrite or change to host/frontend startup behavior.
