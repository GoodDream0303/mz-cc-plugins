# Codex session close implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a final independent review. Steps use checkbox syntax.

**Goal:** Let users explicitly terminate a selected standalone Codex CLI while retaining its transcript.

**Architecture:** A one-shot helper resolves the selected writer lock to one process through Restart Manager. It validates the process before confirmation and again before terminating through a checked process handle. Tk runs helper subprocesses on background threads and presents confirmation/results on its own thread. The passive monitor remains unchanged.

**Tech Stack:** Python 3.9+, tkinter, Windows Restart Manager and kernel APIs; no added dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-codex-session-close.md`

## Global constraints

- No existing user processes may be terminated by automated validation.
- Process inspection happens only in a one-shot helper for the selected session.
- Preserve transcripts, source files, hook trust and unrelated work; no automatic publishing.
- Unknown, ambiguous or changed identities cancel; no fallback to broad process killing.

## Review focus

- Shared app-server or noninteractive Codex modes must never be terminated.
- Ownership/PID incarnation changes between inspection and confirmation must cancel.
- Missing/unsafe lock paths and Windows access failures must leave sessions untouched.
- Cancellation, helper failure and rapid menu changes must preserve UI correctness.
- A terminated process whose lock remains held must not be reported as successfully closed.

### Task 1: Checked one-shot close helper

**Files:** Create `ai-chat-scope/src/codex_close.py`; create `ai-chat-scope/tests/test_codex_close.py`.

**Interfaces:** `inspect_session(home, sid, system=None)` returns JSON-safe `{pid, started}`; `close_session(home, sid, expected, system=None)` returns that identity after verified exit/lock release. `WindowsSessionControl` supplies exact file owners and checked process handles. The helper CLI accepts inspect/close plus home, session ID and expected identity.

- [x] Write failing tests for exact owner, ambiguous owners, rejected modes, changed identity, released locks and unsuccessful exit verification.
- [x] Run the tests and confirm the failures.
- [x] Implement helper and Windows primitives, using the process handle for termination.
- [x] Run targeted tests and a real owned Python child lock/exit fixture.

### Task 2: Codex context menu and documentation

**Files:** Modify `ai-chat-scope/src/scope.pyw`, `ai-chat-scope/tests/test_scope_ui.py`, `ai-chat-scope/README.md`, `ai-chat-scope/src/README.md`.

**Interfaces:** Tk menu starts asynchronous inspect; confirmation starts asynchronous close using returned identity. Result processing stays on Tk; only subsequent monitor data removes the row.

- [x] Write failing UI tests for menu routing, cancellation, exact identity forwarding and error reporting.
- [x] Implement menu and helper subprocess routing; document the action and its limitations.
- [x] Run product and probe suites, inspect the diff, and obtain an independent review.
- [x] Report implementation evidence and remaining real-user acceptance without publishing.

## Verification

`python -B -m unittest discover -s ai-chat-scope/tests -q`: 124 passed. `python -B -m unittest discover -s tests -q`: 22 passed. Helper tests exercise a real owned Python child holding a byte lock and verify process identity, actual exit, release and unchanged fixture bytes; they also reject a junction outside the source root and simulate access denial. UI tests cover confirmation cancellation, identity forwarding, menu switching, duplicate requests, helper timeout and malformed output.

An isolated native codex-cli 0.166.0 instance was launched in a hidden, owned console with a temporary CODEX_HOME and a non-authenticated provider targeting an unused loopback port. No prompt/model turn was submitted. The helper resolved its real lock owner and terminated that exact process; the lock released and a fresh CodexSource returned zero rows. A synthetic session-meta fixture, used because the idle new CLI had not persisted a transcript yet, remained unchanged. This establishes the Windows close path, not a full manual acceptance matrix of real user sessions.

Independent review found one Important issue: the initial mode denylist accepted review, exec-server and unknown modes. New regression cases failed before the fix and passed after replacing it with known interactive options/entry points, handling option values and explicit `--` prompts. The final full suites passed after this fix. Existing user CLI processes were only inspected; none were terminated. Installed caches, hook trust and CLI configuration were not changed; release/install and real user menu acceptance remain separate.
