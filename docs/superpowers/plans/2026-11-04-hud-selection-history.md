# Persistent HUD selection, recent tool history and old-viewer recovery

## Superseding rollback for 0.7.2

The user requested restoring native terminal selection after trying 0.7.1.
Restore the watch loop and runtime viewport interface to the 0.7.0 baseline;
remove mouse ownership, the frozen selection, explicit clipboard writes and the
custom input decoder. Keep truthful current/recent tool history and the accepted
completion-timestamp fix. The original selection plan below records the prior
release and is superseded by this rollback.

`watch-terminal.test.mjs` exercises the real watch loop with an in-memory TTY:
mouse reporting must remain disabled and Ctrl+C must keep the viewer alive until
q is pressed. It failed before the rollback and passed after it. Full Node24
verification passed 227/227; the independent rollback review found no Important
or Critical issues.
Node20 affected checks passed 60/60. The production-backend native smoke passed
16 checks, including Ctrl+C/q behavior and exact viewer respawn; report:
`C:/Users/mzzhu2/AppData/Local/Temp/hud-production-host-G86aM0/summary.json`.

Three fresh production hosts exited with frontend status 1 before a SessionStart
binding. Their HUD viewers then stopped cleanly. Read-only startup log inspection
found model-list request timeouts and remote-plugin catalog network failures,
without an identified fatal initialization error. These observations do not prove
the startup cause. A user-run direct official launch with `--no-alt-screen`
succeeded; the hosted path must be checked again after the rollback is installed.
Do not replace the official CLI, edit daemon/security/hook-trust settings, retry a
failed official session automatically, or resurrect closed hosts.

## Evidence and scope

- Reported failed exec_command entries have real exit_code=1; the logged failures
  inspected are test-related. Keep truthful failure classification, but separate
  current calls from recent history and expire reported terminal calls after 60s.
- The pinned client auto-copies and clears client-side selection on mouse release.
  Use the existing per-pane mouse-protocol yield: HUD handles SGR selection,
  retains its frozen visible frame, copies only on Ctrl+C, and resumes on Escape
  or a new click. Do not replace backend/stop Codex or read the system clipboard.
- Another registered HUD runs 0.6.3 with an unavailable old packaged backend.
  Its source/server/pane identity is valid. Test exact HUD respawn, then refresh
  only verified owned viewers using the installed formal release and original
  proof/binding. No MRU targeting, fake owner identity or other-source restart.

## Tasks

- [x] Add failing recent-history tests and preserve unknown-age terminal calls
  without inventing timestamps. Keep active calls visible and failures honest.
- [x] Add pure SGR/Unicode/release/persistence/cancel/resize selection regressions.
- [x] Implement HUD mouse ownership, frozen frame, explicit clipboard write via
  stdin, and failure feedback; do not persist selected text or clipboard data.
- [x] Test selection survives release/refresh and Escape resumes in native smoke;
  do not inspect or overwrite the user's clipboard during automated checks.
- [x] Test exact viewer respawn preserves its source, binding and neighbor.
- [x] Full suite/Node20/independent review.
- [ ] Publish/install and refresh the
  current viewer plus the specific known old failing viewer under update authority.

## Review and release checks

- Independent review found two important issues: keyboard processing could precede
  mouse release in the same input chunk; an ignored canonical start could invent
  a failed call's missing completion time. Both have failing-then-passing
  regressions in `watch-input.test.mjs` and `reader.test.mjs`.
- A single ordered input decoder now separates mouse reports from keyboard input.
  Tests cover each split, copy on either side of release, delayed CSI prefixes,
  Escape followed by a new drag, and arrow keys. A bare Escape uses the normal
  500 ms ambiguity timeout; an established CSI mouse prefix has no key timeout.
- Final related checks: 71 passed. Native production-backend smoke: 17 passed,
  report `C:/Users/mzzhu2/AppData/Local/Temp/hud-production-host-DzmtkJ/summary.json`.
  Synthetic input and explicit clipboard interception do not verify real desktop
  mouse/copy behavior or access the system clipboard.
- Final full suite: Node 24.15.0, 238/238; Node 20.19.0 with one test file at a
  time, 238/238. The earlier concurrent Node20 run had a lock-contention assertion
  and transient executable cleanup failure; each passed in isolation and the
  final complete Node20 run passed. The initial native timeout under simultaneous
  full-suite load was followed by the successful isolated 17-check run above.
- Git-only offline export of the staged runtime passed without node_modules or
  a build, including all three new runtime modules and live/recent/expired tool
  rendering (`C:/Users/mzzhu2/AppData/Local/Temp/hud-071-git-package-xfhia1pl`).
- Ruling: the previously failing 0.6.3 host is now closed and its viewer exited;
  do not recreate it for an update. Refresh only the verified live current host
  after installing 0.7.1. Cost: old-viewer height recovery needs a live affected
  host to receive a real-running acceptance result.
