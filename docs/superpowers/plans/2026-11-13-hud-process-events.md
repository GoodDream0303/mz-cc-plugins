# HUD process events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HUD updates responsive independently of process, Git and geometry checks while reducing recurring process-detection cost.

**Architecture:** A private native observer uses verified Windows process handles and requested fresh snapshots. Viewer-owned background jobs isolate auxiliary queries from telemetry painting and discard cancelled generations.

**Tech Stack:** TypeScript, Node 20+, native Windows C / Win32, portable Zig build tool only; no new runtime JS dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-hud-process-events-design.md`

## Global Constraints

- Native Windows / Node 20+, offline installed package, no third-party JavaScript runtime dependency.
- No PowerShell daemon, .NET runtime requirement or system-wide service.
- Identity requests remain bounded to six seconds; unknown retains HUD but never authorizes resizing.
- Keep exact source/thread/pane ownership and fresh full verification before mutations.
- Preserve q/Ctrl+C, ten source rows, manual sizing, existing grow/shrink debounce and generic MCP activity.
- Do not change official Codex, Scope, task-handoff, profiles, other live hosts or installed cache.
- Native facts never synthesize unavailable data or compare birth only at millisecond precision.
- Full tests run serially with isolated config/origin; reuse unchanged historical evidence only within its recorded scope.

## Review Focus

- A late observer/job result from a previous binding must not close or resize the replacement.
- A failed or unreadable native query must be unknown, distinct from a confirmed process exit.
- Timestamp precision differences must not create false death or accept a different process incarnation.
- A stalled query must not stall telemetry/stop events or leave a past-due deadline spinning.
- Unicode/offline packages and helper tampering must have bounded, understandable failure behavior.

### Task 1: Native process identity and observer boundary

**Files:** create `codex-hud/native/process-events.c`, `codex-hud/backend/process-events.exe`, `codex-hud/backend/process-events.json`, `codex-hud/scripts/build-process.mjs`, `codex-hud/src/process-monitor.ts`, `codex-hud/src/process-birth.ts`, `codex-hud/test/process-monitor.test.mjs`, `codex-hud/test/process-birth.test.mjs`; modify `codex-hud/package.json`, `codex-hud/src/psmux.ts`.

**Interfaces:** `sameProcessBirth(actual:string,expected:string):boolean` compares strict UTC times at microsecond precision. `ProcessMonitor(proof:HostProof,viewer:ProcessFact,wake:()=>void)` exposes `status`, `nextRetryAt`, `reconcile(now?:number):void`, `facts(pids:number[],signal?:AbortSignal):Promise<ProcessFact[]>`, `close():void`. Status is `starting|verified|unknown|source-exited|closed`; no static singleton or test-only runtime switch.

- [ ] Write birth tests with literal UTC strings: equal instant at 3/6/7 digits; distinct microseconds inside one millisecond; invalid dates/timezones rejected; real WMI/native compatibility exercised by native integration.
- [ ] Run `node --test --test-concurrency=1 test/process-birth.test.mjs` and observe missing implementation failures.
- [ ] Implement the conversion/comparison and use it in `sameProcess`.
- [ ] Write native/client tests using real temporary subprocesses: actual snapshot facts; same PID with wrong birth; unrelated target exit; viewer/parent exit; helper termination becomes unknown; malformed/oversized messages; requests outside proven scope; cancellation; stale client after close; binary checksum mismatch. Runtime tests use the client; direct helper tests cover only the wire contracts not observable otherwise.
- [ ] Run the new tests and record expected failures before writing the corresponding production functions.
- [ ] Implement the C helper, pinned build/verification and TypeScript client; compile with a SHA-verified portable toolchain. Bound pending requests and output, sanitize error codes, close all owned resources. Record compiler provenance.
- [ ] Run `npm run build` and focused birth/monitor/psmux tests. Expected: all pass; native observers terminate after their synthetic parent and target exit, no installed-host operation.
- [ ] Commit the native boundary and relevant generated dist files with a change-specific message.

### Task 2: Independent viewer jobs and integration

**Files:** create `codex-hud/src/background-job.ts`, `codex-hud/test/background-job.test.mjs`; modify `codex-hud/src/cli.ts`, `codex-hud/src/dynamic-height.ts`, `codex-hud/test/viewer-lifecycle.test.mjs`, `codex-hud/test/viewer-refresh.test.mjs`, `codex-hud/test/dynamic-height.test.mjs`, relevant test support and dist.

**Interfaces:** `BackgroundJob<T>(wake:()=>void)` exposes `busy`, `start(key:string,operation:(signal:AbortSignal)=>Promise<T>):boolean`, `take(key:string):{value:T}|{error:unknown}|undefined`, `cancel():void`. Task 1's monitor supplies on-demand facts and exit/status wakeups. The job never executes its continuation for a retired generation.

- [ ] Write job tests: completion wakeup; identical pending work coalesces; cancellation/replacement discards late success and failure without unhandled rejections; failed work can retry. Run and observe RED.
- [ ] Implement jobs and run the focused tests to GREEN.
- [ ] Add viewer regressions before integrating: a deliberately stalled identity/Git/geometry query cannot delay a newly appended model/context value; stop and rebind do not await old work; unknown monitor keeps painting but cannot resize; recovered monitor re-enables fresh checks; old completions cannot affect the replacement.
- [ ] Run the viewer regression cases against unchanged watch logic and record the relevant RED results.
- [ ] Replace periodic PowerShell liveness with the monitor. Schedule Git/height work independently and consume completion events. Invalidate jobs/controllers on binding/config/geometry changes; pending deadlines are excluded from the next wakeup minimum.
- [ ] Update dynamic-height viewer birth validation to the normalized identity comparison. Keep fresh facts and physical checks, and ensure geometry failures do not enter the main telemetry path.
- [ ] Adapt synthetic fixtures at the external process boundary while keeping real files, lifecycle, renderer and controller. Do not replace production state logic with mocks.
- [ ] Run job, monitor, viewer-refresh, lifecycle, async-runtime and dynamic-height tests. Expected: all pass with stop/rebind authority preserved and no new warning/paint starvation.
- [ ] Commit the integrated viewer behavior and generated dist.

### Task 3: Distribution, native behavior and full verification

**Files:** modify `codex-hud/test/package.test.mjs`, `codex-hud/docs/validation.md`, `codex-hud/docs/compatibility.md`, native build documentation and fixture support only as needed. Evidence lives in this plan's ignored workspace.

**Interfaces:** The shipped binary/manifest are under the already-distributed `backend` directory. Package runtime verification must work without native source or compiler. Existing native smoke uses production psmux and synthetic CLI/data.

- [ ] Add and run package tests before fixes: offline Unicode-path native monitor execution and helper tampering rejection. If existing package copying already includes the helper, reuse it.
- [ ] Implement missing packaging checks/documentation and run focused package tests.
- [ ] Run `npm test -- --test-concurrency=1` once on the final behavioral code. Record every failure; resolve evidenced regressions without relaxing assertions or timeouts. Re-run only affected checks until a final full suite is justified by changed behavior.
- [ ] Run fixed-size and dynamic-height native backend fixtures with independent source/viewer processes. For the known narrow-to-wide failure, obtain real psmux/ConPTY scope facts before making any additional fix; a necessary fix requires RED-to-GREEN coverage.
- [ ] Measure four shipped native observers' idle CPU/private memory, requested fact latency and synthetic normal/forced exit notification. Exclude installed-HUD visual/long-term acceptance from these claims.
- [ ] Run one fresh whole-change review against spec, plan, diff and evidence. Fix concrete Critical/Important findings with a regression that fails before the fix and then passes; do not repeat unchanged review cycles.
- [ ] Update validation documentation with environment, exact results, limitations and unresolved acceptance. Commit verified changes. Preserve evidence and unrelated files.
- [ ] Report local commits, validation and remaining real-world acceptance; publish/reinstall only through the project's separate authorized workflow.
