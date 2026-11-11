# Scope Topmost Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single task inline. Steps use checkbox syntax for tracking.

**Goal:** Recover Scope's topmost window order without stealing focus or adding background workers.

**Architecture:** Add a Windows helper to the existing win32_support module; call it from the existing one-second poll only while pinned. Enumerate windows only until the Scope wrapper or an overlapping normal window is reached; reposition only on evidence of lost topmost state.

**Tech Stack:** Python 3.9+, tkinter, ctypes/user32, unittest.

**Spec:** docs/superpowers/specs/2026-11-11-scope-topmost-recovery-design.md

## Global Constraints

- No extra thread, process, timer, dependency, process inspection, or user config writes.
- Retain focus, geometry, hidden/minimized state, and manual unpin behavior.
- No automatic release, cache edit, merge, or push.

## Review Focus

- Native topmost flag can remain set while actual order is wrong: exercise a native fixture with deliberately inconsistent style/order.
- Another topmost window must retain its order: compare real fixture windows before/after poll.
- Hidden/minimized and non-overlapping windows must not cause recovery.
- Correct Tk child-to-wrapper resolution is necessary: use real Tk widgets.
- Native API failure must leave polling scheduled: exercise failure and subsequent retry.

### Task 1: Conditional topmost recovery

**Files:** Modify ai-chat-scope/src/win32_support.py and ai-chat-scope/src/scope.pyw; create ai-chat-scope/tests/test_window_topmost.py.

**Interfaces:** ensure_topmost(hwnd: int) -> bool; resolves the top-level wrapper, returns whether it reapplied topmost; Scope.poll skips it when unpinned.

- [x] Read relevant source/rules and verify the existing isolated worktree; baseline: 124 product tests and 22 root tests pass.
- [x] Add fixture tests; RED: lost flag, flag/order mismatch and API failure recovery fail as expected. The mismatch uses native window order with only its topmost-flag read overridden: Windows ignores direct SetWindowLongW changes to that flag.
- [x] Implement the helper and pinned-only poll integration; initial 8 fixture tests GREEN. Review found zero-area rectangles could falsely overlap; 2 further regressions reproduced this (3 subcase failures), then positive-area guards fixed it.
- [x] Run product/root suites, inspect diff, perform independent review, and measure native steady-state check overhead.
- [x] Complete implementation verification and report remaining manual acceptance; prepare formal 2.2.1 release after the subsequent reinstall request.

## Verification results

- Windows / Python 3.13: final product suite `python -B -m unittest discover -s ai-chat-scope/tests -q`: 134 tests, 44.445 s, OK. Includes 10 new topmost regressions.
- Root suite `python -B -m unittest discover -s tests -q`: 22 tests, 1.466 s, OK; subsequent positive-area guard does not affect root discovery tests.
- Changed Python files parse with Python 3.9 grammar; this is syntax compatibility, not a Python 3.9 runtime test.
- `git diff --check`: clean. Independent read-only review found no further blocking issues; the empty-rectangle finding was fixed with RED-to-GREEN regressions and the final full suite.
- Final native helper benchmark, 2,000 healthy checks per scenario, no repairs: median 0.1123 ms / p95 0.3386 ms; with 20 additional topmost fixture windows ahead, median 0.2150 ms / p95 0.4351 ms. Includes Tk handle lookup; these are this-machine short-run measurements.
- Native fixture recovery preserves the foreground handle and window rectangle; healthy windows retain order behind other topmost windows. API failure logs through the existing poll handler, schedules the next poll, and can recover on retry.
- Manual long-running window switching and suspend/resume remain unverified. Flag/order inconsistency is tested with a controlled flag read and native ordering, not a deterministic reproduction of the original system anomaly.
- Initial implementation validation affected the development worktree only; main, formal caches and user configuration were not changed. Release preparation is tracked below.

## 2.2.1 release preparation

The subsequent reinstall request authorizes the project's formal push → refresh → install → verify flow. Prepare both manifests, clientInfo, packaging assertion and README for 2.2.1; preserve unrelated shared-market updates when combining with main. Do not retrieve credentials from previous sessions or persistent stores; a token must be supplied for this session before authenticated push. Keep the existing Scope window running until the formal release is available.

- Version assertion was verified RED against 2.2.0; after updating release metadata, all 134 product tests passed in 52.592 s.
