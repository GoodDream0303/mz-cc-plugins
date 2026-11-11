# HUD event-driven refresh and necessary polling

Status: proposed design; product implementation has not started.

## Intent and agreed requirements

Apply change-driven work across the HUD, rather than only changing pane height.
Remove unnecessary recurring reads, queries, calculations and terminal writes.
Keep polling where notifications cannot reliably cover the requirement. Choose
its cadence for responsiveness and correctness; low frequency is not a goal in
itself. Event listeners have a cost, so coalesce bursts and measure actual work.

Keep current telemetry, tool categories, localization, pagination, manual/fixed
sizing, lifecycle, provenance and privacy behavior. Maintain native Windows,
Node 20+, the pinned psmux backend and zero JavaScript runtime dependencies.
Do not change Codex, Scope, profiles, source metadata or installed caches. Do not
start real Codex/model requests, publish, reinstall or migrate other viewers.
The initialization-exit investigation and deferred resume hint remain separate.

## Approaches

1. Height scheduling only: small, but leaves the per-refresh log/configuration
   reads and complete redraws. Insufficient for the user's clarified scope.
2. Event-driven HUD with targeted reconciliation and necessary timers: selected
   direction in conversation. Reuse native Node file/TTY notifications and the
   existing trusted readers; avoid a new service or transport.
3. Persistent psmux control connection: can provide layout notifications, but
   adds connection recovery, output handling and client-sizing interactions.
   Not part of this change; do not assume its command set matches the CLI.

The defaults below are implementation proposals, not additional user requests.

## Current behavior

`cli.ts:watch` performs a complete cycle and then sleeps `terminal.refreshMs`
(currently 1000 ms in the user's configuration). Each cycle reloads launch/host
state and configuration, reads parent/known child logs, renders, fits height,
writes heartbeat/viewport and repaints the complete terminal. Session discovery,
owner identity and Git queries have separate five-second gates. Reader calls
retain fingerprint validation even when there are no appended records.

Dynamic height already skips repeated stable backend queries for five seconds.
Growth nevertheless waits another refresh interval; shrink waits at least two
seconds. Actual resizing executes synchronous process and pane checks. Host
frontend exit is already handled by child-process events. Startup acknowledgement
and registration waits are short, bounded polling; lock contention is bounded.

## Runtime scheduling

Replace the unconditional full refresh loop with one serialized refresh worker.
Events mark only the relevant inputs dirty and wake that worker. Merge ordinary
notification bursts over a short window, initially 25 ms. Further notifications
during an asynchronous refresh schedule at most one follow-up with the newest
state. Stop/quit has priority and does not wait for a telemetry debounce.

Separate these operations: control-state reload, configuration reload, parent
read, child discovery/read, Git refresh, render, fit, terminal paint, and runtime
publication. A clock tick must not implicitly perform the other operations.
Only repaint changed visible lines or viewport/page state; do not introduce a
line-diff terminal renderer. Do not skip necessary height checks merely because
the currently cropped visible lines compare equal.

Use invalidation generations for selected session, transcript, configuration and
host registration. Discard stale asynchronous results after an input changes.
No overlapping resize, Git or identity subprocesses. Stop cancels pending work
where supported and prevents later writes/resizes; preserve exit metadata and
terminal cleanup. Define listeners/timers in one owned lifetime and release them
on normal exit, failure, session rebinding and watcher replacement as appropriate.

## Change sources and reconciliation

| Source | Normal trigger | Necessary fallback / limits |
|---|---|---|
| Parent and known child transcripts | Watch the containing directory; reread the exact bound file on relevant change | File-notification reconciliation; reopen on replacement/truncation, retry incomplete writes |
| Configuration | Relevant parent-directory notification | Detect absent/recreated directories; retain current invalid-config warning and recovery |
| Launch and host control state | Relevant directory notification; reload validated state | Detect lost notifications and owner crash; never infer current ownership from a notification |
| Unresolved session/child log | Relevant session-tree creation/change notification while discovery is needed | Bounded retry for delayed/partial metadata; existing exact identity, parent and ambiguity checks |
| Terminal geometry and page keys | TTY resize and key events | Windows/ConPTY geometry reconciliation; fixed/manual rules remain intact |
| Git status | Cwd/configuration change and normal polling when displayed | Keep the existing five-second cadence initially; no recursive watcher over an arbitrary repository |
| Owner process identity | Host closure notification plus periodic identity query | Keep the existing five-second cadence initially; unavailable identity keeps HUD open and pauses unproven resize |

Notifications are hints to reread trusted state, never proof. Directory watching
must handle atomic replacement, rename, unknown filenames, notification storms,
missing directories, watcher error/closure and recreation. Subscribe before the
initial read, and reconcile after subscription so changes cannot fall into a
read-then-subscribe gap. Watch only the needed directories, share duplicate
subscriptions and release unused subscriptions. Do not discover or bind by MRU,
title, filename guesses or a different session's activity.

Reconciliation runs independently of painting and uses inexpensive input
checks where sufficient. It must retain the reader's replacement, rewrite,
fingerprint and during-read integrity guarantees; no unchecked stat-only cache
may replace them. No promise of zero idle I/O. Keep the current refresh interval
as the initial fallback responsiveness bound for lost control/log notifications;
measure and narrow the actual work rather than arbitrarily slowing it down.
If safe no-change detection still requires a reader check, retain that check.
Watcher failure enables polling at the required cadence and retries subscription
without busy looping. Healthy listeners are not sufficient evidence to disable
all reconciliation.

Heartbeat/viewport publication must not cause a notification-feedback loop.
Compare the externally meaningful launch projection (binding, stop/state, host
identity) and ignore heartbeat-only/unchanged-viewport notifications. Maintain
heartbeat separately at the existing configured refresh cadence initially, and
publish changed viewport without waiting for a heartbeat. Preserve the locked
read-modify-write path so publication cannot overwrite concurrent stop/binding.

## Timed display changes and height

Schedule one-shot deadlines for Recent tool/agent expiry and quota-reset state
changes, including their existing exact boundary rules. Schedule display ticks
only for enabled time-dependent fields with valid timestamps (tool/agent elapsed
time, session duration and relative quota times). Do not invent live clock updates
for absolute timestamps. Preserve the configured display cadence; a tick can
render cached telemetry but must not query logs, Git or process identity solely
because time passed. Recompute deadlines after input/configuration/page changes.

Calculate desired height when layout inputs change: content row count, geometry,
height configuration, registration or outstanding candidate/deadline. Initially
coalesce growth for 50 ms and keep the existing 2000 ms stable-shrink delay.
Use an independent deadline rather than waiting for another refresh cycle.
Retain ratio caps, ten source rows, exact two-pane scope, growth pager behavior,
and fixed sizing. A changed target replaces an obsolete pending candidate.

Every actual resize still obtains fresh process incarnations, source/server
proof, current display registration and physical pane facts. A cache or event
cannot authorize a mutation. Perform recurring expensive child-process queries
asynchronously without changing their validators, timeouts, output bounds or
scope. Recheck current generation, stop state and registration after awaited
queries and before mutation. A post-resize check confirms the resulting pane;
the resize's own TTY event must settle without an oscillation or repeated resize.

## Scope of retained polling

Audit all recurring and bounded waits. Keep the startup acknowledgement
(50 ms, existing deadline), metadata/frontend registration retries (100 ms,
existing deadlines), and contention retries for this change: they cover a short
startup race and are not idle recurring work. Do not add IPC or weaken startup
proof to remove these sleeps. Existing frontend `exit` events stay event-driven.
Demo heartbeats and duration remain timed behavior, not telemetry polling.
These choices and retained runtime fallback/identity/Git checks must be listed
in the delivery, with their cadence and reason. Do not claim all polling removed.

## Compatibility and documentation

Keep config keys/defaults, launch/host schema and CLI commands readable by current
tools. `terminal.refreshMs` continues to set periodic display/heartbeat/fallback
cadence; reliable change notifications may refresh sooner. Document this clarified
meaning and replace help text that promises every refresh reads all telemetry.
Do not rewrite the user's saved configuration. `once`, JSON/noninteractive
output, startup hooks and offline package loading retain their existing behavior.

## Verification and acceptance

- Behavioral regressions: quiet input does not cause needless repaint/config
  parse; append and atomic replacement refresh the exact source; event bursts
  settle to the newest state; changed session/child parentage rejects stale work.
- Lifecycle/fallback: watcher creation failure, lost events, absent/recreated
  directories, stop during async work, owner identity unavailable/replaced, clean
  listener/timer release, and self-written heartbeat never producing a loop.
- Time/height: no new input is needed for expiry/time fields; hidden/disabled
  fields do not create needless ticks; growth does not wait a refresh interval;
  shrink, pagination, width changes, manual/fixed size and proof failures retain
  their required outcomes.
- Measure the unchanged 0.7.14 baseline and candidate with the same synthetic
  parent/child fixture, idle, burst, append, expiry and resize scenarios. Count
  reader/config reads, discovery, backend/identity/Git subprocesses, runtime
  writes and paints; record CPU/wall time and append-to-visible latency. Distinguish
  mandatory heartbeat/reconciliation from avoidable work. Require a reduction
  in unnecessary idle work and no regression in necessary-response bounds;
  report results rather than promising a universal CPU percentage or zero latency.
- Keep tests focused on these observable contracts, including controlled
  notifications/clock and a small real native file-watcher fixture. Run relevant
  regressions then the full suite serially with isolated MZ_HUD_CONFIG_FILE and
  MZ_HUD_ORIGIN; reuse unchanged earlier checks. Validate Node 20 and offline
  loading if the runtime is available, otherwise report that gap explicitly.
- Real ConPTY notifications, startup duration, ongoing interaction and long-term
  stability require separately scoped native fixture/user acceptance. Synthetic
  results do not prove the installed 0.7.14 viewer has changed or passed them.

## Builder discretion

Choose the smallest internal helper boundaries and injected test seams that fit
the current code. Do not introduce a general event bus, framework, persistent
session index, native addon, daemon or new user-facing tuning controls. Timing
proposals may be adjusted from measured evidence to protect experience; explain
material deviations. Bring back any change to ownership/privacy constraints,
supported runtime, required user actions or public behavior beyond this design.
