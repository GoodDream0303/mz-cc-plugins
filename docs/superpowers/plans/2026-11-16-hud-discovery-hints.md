# Bounded Child Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce unrelated directory-event scanning while retaining child binding and recovery behavior.

**Architecture:** Carry bounded changed-file hints from the event layer to the agent tracker. Reuse metadata parsing, and confirm a matching hint through a fresh full scan before binding. Keep the five-second full fallback and exact existing source authority.

**Tech Stack:** TypeScript, Node 20+, native Windows, existing Node tests and pinned psmux.

**Spec:** `docs/superpowers/specs/2026-11-16-hud-discovery-hints-design.md`

## Global Constraints

- Native Windows and Node 20+; no new runtime dependency, service or user setting.
- Five-second full discovery fallback, 25ms notification merge and all existing source/ancestry/birth/physical-pane checks remain.
- No release, installation, live-viewer migration, profile/PATH or other-plugin changes.
- Serial isolated tests; retain original limits/assertions, ignored evidence and existing pycache.

## Review Focus

- Duplicate matching IDs must never become a unique binding through the hint path.
- Missing/partial files and watcher loss must preserve stale data and eventual fallback.
- Lexical escapes, parent junctions and symlinks must not broaden transcript reads.
- Queued events from retired handles and cancellation/rebind must not cross scopes.
- Completed/closed/interrupted child lifecycle and model recovery must retain their meaning.

## Task 1: Bounded event paths and shared metadata reads

**Files:** Modify `codex-hud/src/refresh-events.ts`, `codex-hud/src/sessions.ts`; extend `test/refresh-events.test.mjs` and `test/sessions.test.mjs`; include generated dist.

**Interfaces:** Produce `takeDiscoveryFiles(): string[]` and `readSessionHints(root: string, files: readonly string[]): Promise<SessionInfo[]>` as specified above. No caller changes in this task.

- [ ] Write regressions for draining/deduplication/256-path bounds, nameless events, paths beginning with two dots, retired callbacks, and close.
- [ ] Write metadata tests for reading only hinted heads, eight-worker/256-path bounds, UTF-8, partial records, wrong-parent data, lexical/canonical escapes and symlinks where native privileges permit.
- [ ] Run `node --test --test-concurrency=1 test/refresh-events.test.mjs test/sessions.test.mjs`; Expected: new behavior assertions fail on baseline.
- [ ] Implement the two interfaces, sharing bounded first-record parsing with full discovery.
- [ ] Run `npm run build`, then the same focused command; Expected: all pass.
- [ ] Commit the Task 1 files and generated dist with related tests only; record evidence in the task ledger.

## Task 2: Preserve binding uniqueness and integrate the viewer

**Files:** Modify `codex-hud/src/agent-sessions.ts`, `codex-hud/src/cli.ts`, related agent/viewer tests and `test/support/viewer-probe.mjs`; update validation documentation and generated dist.

**Interfaces:** Consume Task 1 APIs through optional `refresh(..., {files?: readonly string[]})`. Hints narrow work, while `listSessions` still establishes uniqueness. Ambiguous retry gates are pruned to retained IDs and expire after 5000ms.

- [ ] Write an unrelated-event regression counting metadata opens; verify it fails before implementation.
- [ ] Cover early genuine child discovery, nonstandard names, partial writes, duplicate matching IDs and bounded ambiguous retries, wrong parents and five-second fallback with controlled clocks.
- [ ] Add a viewer probe proving actual directory paths reach the tracker and new child completion paints before the ordinary fallback interval; retain cancellation/rebind checks.
- [ ] Run focused agent/viewer regressions; Expected: new behavior assertions fail on baseline.
- [ ] Implement hint filtering, fresh uniqueness confirmation and viewer plumbing without changing lifecycle or source checks.
- [ ] Build and run focused discovery/reader/viewer checks; Expected: all pass.
- [ ] Run `npm test -- --test-concurrency=1`; Expected: all tests pass, no skips/cancellations.
- [ ] Run the existing `scripts/smoke-host.mjs` with the pinned backend and dynamic-height/row-paint/task-line/copy-safety options; Expected: native synthetic checks pass with clean owned-process teardown.
- [ ] Measure the final build with four isolated sources against 0.8.0; preserve actual CPU, memory, scan and latency scope without repeating the entire unchanged prototype experiment.
- [ ] Update validation with actual results and limits, commit only this task's changes, and complete the ledger.

## Final review and delivery

- [ ] Request one independent whole-change review covering the five Review Focus cases.
- [ ] Resolve any Critical/Important finding with a precise RED-to-GREEN regression and rerun affected checks/full suite as required.
- [ ] Leave all evidence in place, verify clean task-specific Git state and no owned experimental processes, and report local commits plus deployment/acceptance limits.
