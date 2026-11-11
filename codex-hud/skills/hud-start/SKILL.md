---
name: hud-start
description: Use when the current configured Codex conversation has a missing or closed HUD, or the user wants to open or reopen it manually.
---

# Open the current HUD

This is the manual open/reopen entry. It reuses a verified live HUD or opens the
missing HUD for this conversation. First-time initialization belongs to
[hud-setup](../hud-setup/SKILL.md); do not rewrite profiles or preferences here.
Resolve the installed plugin root two directories above this skill.

Run from the current Codex tool environment:

```text
node "<plugin-root>/bin/hud.mjs" doctor
node "<plugin-root>/bin/hud.mjs" start
```

Use the existing Node20+ executable; no reinstall, build or dependency installation
is needed for a configured package. Doctor readiness is a prerequisite report,
not source ownership or native hook trust. `start` verifies current host ancestry,
actual process birth times, source/HUD panes and this thread before attachment.
It does not launch another Codex or model turn.

- An existing verified live HUD is reused; delayed telemetry alone is not proof
  it died. Never create a duplicate to hide uncertain identity.
- When the old process/pane are confirmed gone, `start` opens the replacement in
  that same source host. Check the returned state and progressing heartbeat.
- `start --session ID` is restricted to the current proven conversation; it does
  not authorize picking another window or guessing a thread.
- Genuine remote TUI metadata may use source=vscode, originator=codex-tui and
  thread_source=user. The implementation accepts it only after actual host
  verification; ordinary IDE and subagent logs remain excluded.
- Without a registered physical host, explain the missing prerequisite and use
  hud-setup when initialization is requested. A standalone PowerShell prompt
  outside the current host cannot identify which active conversation to reopen.

User command inside the intended conversation: `$codex-hud:hud-start`.
`q` closes only the HUD; the same command reopens it. Ctrl+C does not close it.
Manual start does not require a trusted SessionStart hook; automatic binding does.
Never choose MRU/latest log, fake rootPid/ancestry, send keys to another pane,
restart another session, change daemon/security/trust settings, or take over
terminal mouse selection and clipboard. Preserve sizing and native statusline.
