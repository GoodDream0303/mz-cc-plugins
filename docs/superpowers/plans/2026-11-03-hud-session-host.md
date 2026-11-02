# Automatic per-Codex HUD implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax.

**Goal:** Every simultaneous Codex launched normally from PowerShell tabs/windows has an independent, correctly paired HUD.

**Architecture:** A transparent PowerShell entry creates a unique psmux host per interactive invocation and calls the original official command. A real source-pane bootstrap publishes process/server incarnations and opens a waiting HUD. Native SessionStart binds metadata only after physical ownership verification; no MRU routing remains.

**Tech Stack:** TypeScript, Node 20+, Windows PowerShell 5/7, pinned portable psmux 3.4.0, Node test runner.

**Spec:** `../specs/2026-11-03-hud-session-host-design.md` (user approved).

## Global Constraints

- Preserve official Codex, original arguments, native statusline, CODEX_HOME and security/daemon settings.
- UI English, task names in their original language; never display session IDs as names.
- Do not guess via MRU/focus/title/latest logs. Unknown ownership stops attachment, not completion of the goal.
- Do not persist invocation arguments, conversation content, credentials or environment dumps.
- Work in the existing HUD worktree; preserve unrelated files. No publishing or user profile/config edits during development.
- Bootstrap must show its own waiting HUD before a model turn; no hidden model prompts.
- Shared-daemon per-client origin remains a feasibility gate; do not substitute an inherited live nonce for proof.

## Review Focus

- Two live frontends of the same resumed thread must not share a physical HUD (Task 2).
- A late/failed split may have created a pane: uncertain intent must prevent duplicate creation (Task 2).
- Shared daemon retaining frontend A's environment must not route frontend B to A (Task 1/2).
- CLI maintenance commands and non-TTY pipelines retain original behavior and exit codes (Task 3).
- An upgrade/deletion or user-edited profile block must not silently invoke stale code or erase user content (Task 3/4).

### Task 1: Exact physical identity and psmux operations

**Files:** create `codex-hud/src/psmux.ts`, `codex-hud/bin/process-facts.ps1`, `codex-hud/test/psmux.test.mjs`.

**Interfaces:** `ProcessFact {pid,parentPid,name,startedAt}`; `HostOrigin {binary,dataDir,namespace,tmux,session,pane,originId,hostDir}`; `HostProof {origin,owner,server,window}`. Export `readHostOrigin(env)`, `readProcessFacts(pids,rootPid)`, `PsmuxClient.pane(id)`, `PsmuxClient.split(rows,launchFile)`, `proveOwner(origin, dependencies?)`, `verifyHost(proof, role, dependencies?)`. Dependencies isolate external command/process queries; no test mode in production.

- [x] Write tests for missing/contradictory endpoint, reused PID, non-owner ancestry, shared-daemon ancestry, exact detached split argv and duplicate pane IDs across servers. Expected: explicit ownership failures, zero mutation on invalid origin, exact source target on valid split.
- [x] Run `node --test codex-hud/test/psmux.test.mjs`; observe RED before implementing (5 missing-backend failures).
- [x] Implement strict origin validation, allowlisted process helper and scoped psmux client. Query commands have bounded time/output and no shell interpolation.
- [x] Run full `npm test`: 66/66; real process helper verified node.exe PID/birth and 9 ancestors.
- [x] Commit only Task 1 source, tests and generated dist after verification.

### Task 2: One waiting/bound display per live owner

**Files:** create `codex-hud/src/host-session.ts`, `codex-hud/test/host-session.test.mjs`; modify runtime/cli/autostart and their tests, hook configuration, diagnostics, height calculation as required.

**Consumes:** Task 1 proof/client/process interfaces.
**Produces:** `registerHost(proof,root)`, `readHost(file)`, `ensureHostDisplay(record,config,options?)`, `bindHostSession(record,sessionId,transcriptPath,options?)`, `closeHost(record,exitCode)`, `acknowledgeViewer(launchFile)`. Host records contain only identity/lifecycle metadata and a validated launch reference.

- [ ] Write RED tests: waiting HUD with no transcript, cross-owner same thread independence, duplicate concurrent hook, rebind without stale reader data, closed HUD reopen, uncertain split refusal, dead/reused owner/server, independent shutdown; ordinary start/hook must never launch WT MRU.
- [ ] Implement owner-slot locking, metadata intents, viewer PID/pane acknowledgement and lifecycle. Bind hook metadata only with proven frontend ancestry; refuse unproven shared-daemon origins.
- [ ] Update watch to display waiting telemetry without selecting any session; recreate reader and discard stale snapshot on identity changes. Validate exact viewer identity before marking running.
- [ ] Change SessionStart to a bounded synchronous binding stage. Keep diagnostics quiet and English; no trust modifications.
- [ ] Run focused tests and full `npm test`; expect zero failures, with no live terminal/process changes from unit tests.
- [ ] Commit Task 2 including generated dist and updated tests.

### Task 3: Transparent PowerShell entry and safe setup

**Files:** create `src/host-launch.ts`, `src/profile-setup.ts`, `bin/powershell-entry.ps1`, `bin/official-codex.ps1`, corresponding tests; integrate CLI/config.

**Consumes:** registration/display/lifecycle from Task 2.
**Produces:** `classifyCodexInvocation(args)`, `launchHostedCodex(invocation,options?)`, `runHostOwner(invocation)`, `profileChange(file,entry)` and explicit dry-run/apply/remove CLI commands. Invocation contains official command path, shell path and original argv in memory only.

- [ ] Write RED tests for interactive/maintenance/pipeline routing and literal argv preservation through PS5/7; test profile create/update/conflict/uninstall with temporary files.
- [ ] Implement entry routing and unique in-place psmux namespace. Run official launcher exactly once; preserve its arguments and eventual exit status. Never edit installed official Codex shims.
- [ ] Register actual bootstrap, open waiting display, execute official command, stop only owned display on exit. Detached hosts remain independent and alive.
- [ ] Add `host.psmuxPath`; setup prints concrete changes by default and writes only with explicit apply. Existing function/alias or modified blocks require resolution, not overwrite.
- [ ] Run focused tests and full `npm test`; commit source/tests/dist. Do not apply setup to user profiles.

### Task 4: Packaged integration and acceptance evidence

**Files:** create isolated host smoke script and update README, skills, validation docs and plan checkboxes.

- [ ] Use a fresh data root/namespace and verified pinned portable psmux to exercise production backend with real OS owner processes and synthetic telemetry; no fixture owner files as production authority.
- [ ] Check two independent hosts, same-thread/two-owner, pending HUD, rebind, concurrency, closed/crashed HUD, owner exit, stale server and uncertain launch. Check background targeting with UI evidence.
- [ ] Exercise installed-package copy without node_modules. Validate PS5/7, hostile argv, and Node20 where available.
- [ ] Run full suite; inspect all results. Perform independent whole-change review, address important findings with RED→GREEN tests, then commit.
- [ ] Prepare exact deployment changes and truthful remaining acceptance steps. Real Codex hook/trust and two UI scenarios need actual evidence; do not mark goal complete from synthetic smoke alone.

## Execution evidence

- Baseline before implementation: 61/61 tests passed; branch `feat/codex-hud`; unrelated `task-handoff/scripts/__pycache__/` preserved.
- Ruling: create a waiting HUD from the real bootstrap before SessionStart — meets the idle-TUI requirement without model requests; data remains unbound until proven.
- Pre-flight: Task 2 consumes Task 1 identity; Task 3 consumes Task 2 lifecycle; Task 4 exercises all production interfaces. No independent implementer delegation needed.
