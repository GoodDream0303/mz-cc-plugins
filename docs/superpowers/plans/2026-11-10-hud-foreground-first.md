# HUD foreground-first startup implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single task inline with TDD and a final fresh review.

**Goal:** Start the official frontend without waiting for HUD acknowledgement, as the user approved in this conversation.

**Architecture:** Publish the exact display intent, then start the frontend once while HUD creation/acknowledgement continues. Preserve the fresh post-acknowledgement process proof. A proven SessionStart hook may bind the already-published intent while display creation owns its startup lock; launch-file updates already have their own lock. Abort outstanding HUD waits when the foreground child exits.

**Tech Stack:** Existing TypeScript/Node20+, PowerShell and pinned psmux; no new dependencies.

**Spec:** User-approved short design: main interface may appear before the HUD is ready; keep source/identity checks, ordinary arguments/exit status and native terminal behavior. The prior assistant inferred retirement of App Server from the user's HUD-only boundary; the user did not explicitly request retirement. This task leaves the installed mode unchanged and does not decide the separate App Server question.

## Global constraints

- HUD changes only; no edits to Scope, Codex, profiles, live runtime metadata or installed cache.
- No automatic App Server/remote switch, dependency installation, real model request or release.
- Keep owner/server/frontend/viewer birth-time, ancestry and physical pane verification; no longer-lived proof caches.
- Tests use isolated configuration/origin and run serially.

## Review focus

- Early frontend exit or spawn error: stop waiting, preserve status, request only this HUD to stop, never launch a second frontend.
- Display failure before or after intent publication: frontend still starts exactly once, failed creation remains uncertain.
- Hook racing viewer acknowledgement: retain the exact thread binding without duplicate panes or weakened ancestry checks.
- Wrong/reused physical source: reject binding; hook data never authorizes Connected state or a resize.
- Lost split response: preserve the existing no-duplicate recovery rule.

### Task 1: Remove HUD acknowledgement from the frontend launch prerequisite

**Files:** Modify `codex-hud/src/host-launch.ts`, `codex-hud/src/host-session.ts`, their startup/session tests, generated dist and `codex-hud/README.md`.

**Interfaces:** Optional `HostDisplayOptions.onPublished?:()=>void` fires after the exact display intent is persisted; optional `signal?:AbortSignal` cancels acknowledgement waiting. Existing callers retain their default behavior.

- [x] Add a deterministic regression where a synthetic frontend only releases HUD acknowledgement after it starts; verify RED against the current implementation. Cover early exit, spawn error and split failure without a second official invocation.
- [x] Add a SessionStart binding regression with the owner holding the display startup lock; assert preserved thread/transcript, one split and rejection of an unproven hook.
- [x] Implement one-shot frontend start at publication and cancellable acknowledgement. On hook lock contention, bind only an existing, current display intent after fresh exact host/ancestry proof, using the launch-file lock.
- [x] Run focused startup/host/hook/fallback/lifecycle/runtime tests; correct specific failures. Update README to state the changed launch order and its measurement limits.
- [x] Build and run full serial tests once, plus Node20 affected/offline coverage. Run `git diff --check`, verify HUD-only scope and obtain one fresh read-only review. Fix concrete blocking findings, then stop without publishing.

## Evidence and decisions

- Baseline from this real session's process birth times: HUD owner 19:31:18.625, frontend wrapper 19:31:27.144, official codex.exe 19:31:29.892 (Asia/Shanghai). This is about 11.3 seconds before the native process starts, not an end-to-end UI measurement.
- Prior user-history audit: 17:02 user asked that changes stay in the plugin; at 17:05/17:12 the assistant chose rollback/retirement. Do not attribute explicit App Server rejection to the user.
- Initial full serial run passed 324/324 before review fixes. The fresh reviewer found three Important concurrency issues: acknowledged-viewer checks on contention, binding loss during replacement, and whole-host-record overwrites. All were reproduced with failing tests and fixed in one pass; additional tests cover viewer acknowledgement and pointer changes during proof. Slow proofs stay outside the short host-record lock; replacement copies bindings while holding the previous launch lock.
- Final Node24.15.0 build/full serial suite passed 329/329, zero failures/skips (`%TEMP%/hud-foreground-first-final-full.log`). Final Node20.19.0 affected and offline-package coverage passed 72/72, zero failures/skips (`%TEMP%/hud-foreground-first-node20.log`). Focused final startup/session checks passed 28/28 before that full run.
- `git diff --check` passed; Scope/task-handoff have no tracked diff. All 184 installed HUD0.7.11 files remain byte-identical to the formal marketplace checkout. Raw Git blobs use different line endings from the installed checkout and are not the byte-comparison reference.
- No release, installation, real Codex launch or UI timing test was performed. The existing 11.3-second baseline and synthetic ordering proof do not establish the new end-to-end startup time.
- Parallel MCP topology research is recorded in `docs/superpowers/specs/2026-11-10-hud-mcp-minimal-change-options.md`; no topology in that research was implemented or selected on the user's behalf.
