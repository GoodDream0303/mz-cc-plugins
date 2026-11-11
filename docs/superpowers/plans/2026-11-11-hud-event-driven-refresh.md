# HUD event-driven refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove unnecessary periodic HUD work while preserving responsive necessary polling.

**Architecture:** One serialized viewer worker consumes coalesced file/TTY/key events and independent deadlines. Existing readers and identity validators remain authoritative; targeted reconciliation and async subprocesses preserve responsiveness.

**Tech Stack:** TypeScript, native Node 20+ APIs, Windows/ConPTY, pinned psmux, node:test.

**Spec:** `docs/superpowers/specs/2026-11-11-hud-event-driven-refresh-design.md`

## Global Constraints

- Native Windows, Node 20+, pinned psmux backend, zero JavaScript runtime dependencies.
- Keep exact session/parent/process/pane provenance and privacy checks.
- No changes to Codex, Scope, profiles, installed caches or saved user configuration.
- No real Codex/model requests, automatic publication, reinstall or other-viewer migration.
- Necessary polling cadence prioritizes experience; no blanket frequency reduction.
- Full tests serial with isolated MZ_HUD_CONFIG_FILE and MZ_HUD_ORIGIN.

## Review Focus

- Atomic replacement and temporarily missing directories must not strand a subscription (Task 1).
- Notifications from heartbeat writes must not recursively produce redraw/write storms (Task 3).
- Stop/rebind during async process queries must not permit stale telemetry or pane mutation (Tasks 2/3).
- Expiry, relative time and elapsed fields must update without new log records (Task 3).
- Watcher failure/lost notifications must preserve current fallback response bounds (Tasks 1/3).

### Task 1: Wakeups and file invalidation

**Files:** create `codex-hud/src/refresh-events.ts`, `codex-hud/test/refresh-events.test.mjs`; add synthetic viewer fixture/measurement in `codex-hud/test/support/viewer-probe.mjs`.

**Interfaces:** `RefreshEvents.request(reason:string,delayMs?:number):void`, `wait(deadline:number):Promise<Set<string>>`, `watch(file:string,reason:string,recursive?:boolean):()=>void`, `close():void`. A deadline wake returns an empty set. Watch errors invalidate the relevant source; fallback runs independently. Shared directory watches filter relevant filenames, handle unknown filenames and retry attachment on reconcile.

- [x] Add tests proving merged burst wakeups, wake during work, close release, directory atomic replacement, missing directory recovery, and immediate stop priority; measure unchanged viewer with a timed independent stop.
- [x] Run `npm run build` then `node --test --test-concurrency=1 test/refresh-events.test.mjs`; expected RED on missing helper, not a test syntax error.
- [x] Implement owned wake/deadline and directory subscriptions, bounded event coalescing and cleanup. Avoid general event-bus infrastructure.
- [x] Run the focused command; expected all pass, no leaked handles. Save the unchanged 0.7.14 synthetic counts/latency before Task 3.
- [x] Commit Task 1 files and generated dist with a change-specific message.

### Task 2: Responsive and safely timed resizing

**Files:** modify `codex-hud/src/psmux.ts`, `dynamic-height.ts`, `environment.ts`, `test/dynamic-height.test.mjs`, `test/psmux.test.mjs`; create `test/async-runtime.test.mjs`.

**Interfaces:** add async process-facts/backend entry points with the existing arguments, validators and output bounds; existing synchronous startup API remains. `DynamicHeightController.fit(...)` becomes async and accepts an optional current-state guard; expose `nextCheckAt` for 50 ms growth, 2000 ms shrink and 5000 ms stable reconciliation. `readEnvironmentAsync(cwd,signal?)` retains five-second caching and facts shape.

- [x] Add RED cases for growth at 50 ms with refreshMs=1000, stable shrink at 2000 ms, stop/rebind after an awaited query, and asynchronous child query allowing an unrelated timer to fire.
- [x] Run build and serial dynamic-height/async-runtime/psmux tests; expected new behavioral failures.
- [x] Implement async recurring subprocess calls, shared validation, exact freshness checks before mutation and independently exposed candidate deadlines. Update existing height callers/tests for async.
- [x] Run focused tests including existing provenance/geometry rejection cases; expected all pass.
- [x] Commit Task 2 files/dist; record timings and retained polling rationale.

### Task 3: Event-driven viewer and time-only display work

**Files:** modify `codex-hud/src/cli.ts`, `agent-sessions.ts`, `test/viewer-lifecycle.test.mjs`; create `src/display-deadline.ts`, `test/display-deadline.test.mjs`, `test/viewer-refresh.test.mjs`; use Task 1 viewer fixture.

**Interfaces:** Task 1 `RefreshEvents`; Task 2 async runtime/height APIs. `nextDisplayAt(snapshot,config,now):number` returns the next relevant expiry/display tick or Infinity. Agent tracker reports known transcript paths and accepts file invalidation; exact parent checks remain.

- [x] Add RED cases for unchanged input avoiding parse/paint, atomic append/replacement and config reload, burst latest-state convergence, heartbeat-only notifications without feedback, expiry with no append, and stop/rebind while query pending. Adapt lifecycle fixture to independent stop timing rather than requiring duplicate paints.
- [x] Run new viewer/display tests; expected behavioral failures against the old complete refresh loop.
- [x] Replace periodic full work with input dirty flags and serialized event/deadline processing. Subscribe before initial read; preserve reader integrity reconciliation, stop/host state, async generation guards and one-shot/noninteractive output.
- [x] Separate heartbeat, owner/Git checks and clock-only render. Compare final output before terminal write. Keep fallback at refreshMs, identity/Git at five seconds, startup bounded waits unchanged. Watch unresolved session tree only while needed; release on rebind/exit.
- [x] Run viewer-refresh/viewer-lifecycle/display/agent/reader/dynamic-height regression tests serially; expected all pass, no leaked watchers or stale mutation.
- [x] Commit Task 3 files/dist and record actual idle/burst/expiry counters against baseline.

### Task 4: Validate, document and review

**Files:** modify `codex-hud/README.md`, `src/menu-help.ts`, `docs/validation.md`, affected package tests only where required; generated dist follows source.

**Interfaces:** final CLI and configuration behavior from Tasks 1-3; no schema/version change or installation.

- [x] Update help in three languages: refreshMs controls periodic display/heartbeat/fallback, notifications can update earlier; growth 50 ms, shrink 2000 ms, retained necessary polling and native acceptance limitations.
- [x] Run `npm test -- --test-concurrency=1` with isolated inherited HUD variables; expected zero failures/cancellations/skips. Run Node20/offline checks if available, otherwise state their precise gap.
- [x] Run the same synthetic native file-watcher/parent-child scenarios against baseline and final code; record reads, subprocesses, writes, paints, CPU/wall/latency without claiming installed-runtime results.
- [x] Perform one fresh whole-change review against spec, plan and diff. Fix material findings RED→GREEN, rerun affected/full checks after final code changes; do not repeat unchanged reviews.
- [x] Commit validated docs/code; report branch, exact evidence, necessary polling cadences and remaining native/user acceptance. Do not publish or merge automatically.
