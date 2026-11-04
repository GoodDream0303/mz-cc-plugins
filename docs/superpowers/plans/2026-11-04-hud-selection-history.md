# Persistent HUD selection, recent tool history and old-viewer recovery

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
