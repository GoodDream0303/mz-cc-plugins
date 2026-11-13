# HUD process events and independent display updates

## Intent and authorization

The user prioritizes experience, functionality and reliability and explicitly
allows architectural changes without limiting their size or development time.
They delegated implementation decisions after reviewing the monitoring proposals
and measurements. Proceed in the existing `feat/codex-hud` worktree. This design
records the implementation choices being made on that authority; no publication
or migration of other running hosts is included.

The reported symptom is a recoverable source-identity warning, especially when
returning to an idle conversation. Actual repeated PowerShell identity queries
exceeded their original six-second limit. File registrations were readable.
The main watch loop awaits these queries before reading and painting telemetry.

## Goals and acceptance

- Replace recurring PowerShell/WMI liveness checks with exact Windows process
  handles. Preserve the identity and physical-origin checks that establish a host.
- Telemetry, configuration and stop/rebind events remain responsive while identity,
  Git or physical-geometry queries are slow or temporarily unavailable.
- Normal and abrupt source exit are distinguished from monitor/query failure.
  Failure means unknown: retain telemetry and the HUD, suspend automatic resizing,
  and retry conservatively without creating duplicate observers.
- Four hosts remain independent, including the same conversation in two hosts.
- Actual resizing still requires fresh process facts, complete physical scope,
  current registration and cancellation checks around asynchronous work.
- Ship offline on native Windows / Node 20+ with no third-party JavaScript runtime
  dependency, PowerShell daemon, .NET runtime requirement or system-wide service.
- Verify real helper memory, idle CPU, exit delivery and packaged execution, then
  run the full serial suite and native backend fixture with synthetic CLI/data.
  Do not describe fixture results as official Codex/visual/long-term acceptance.

## Approaches

1. Reuse one PowerShell child per viewer: measured about 295 MiB private committed
   memory for four children; avoids some startup work but retains WMI query cost.
2. A per-viewer process-handle observer plus on-demand native snapshots: chosen.
   A C# Windows-API experiment used about 44.4 MiB for four observers, no measured
   CPU increase in 20 idle seconds, and 8.5 ms median exit detection in 20 trials.
   Build the shipped helper in C to remove the managed runtime requirement;
   measure it independently rather than extrapolating the prototype numbers.
3. An in-process Node-API addon could avoid the extra process but introduces native
   module loading and crash coupling. A small private child gives a clear failure
   boundary without a global broker or cross-host routing.

## Native boundary

`native/process-events.c` builds `backend/process-events.exe` for win32-x64,
matching the existing packaged Windows backend. Its adjacent JSON manifest pins
the binary SHA256, source SHA256, protocol version and compiler provenance.
Runtime verifies the packaged binary before each launch; offline use needs no
compiler. Build tooling checks the checked-in artifact and supports an explicit
portable Zig compiler path. Never download or compile during product startup.

The child receives only validated numeric process IDs and expected creation times
for the current viewer and its already-proven owner/server/optional frontend and
any existing App Server process proof. This preserves legacy source formats without
creating a service, probing its endpoint or restoring withdrawn MCP features.
It opens query/synchronization handles and verifies creation times before ready.
The parent's handle is included, so an abruptly terminated viewer cannot orphan
the observer. Monitor and snapshot failures carry bounded codes, never raw error
text, command lines, conversation content, credentials or terminal captures.

The child owns a blocking kernel wait and a blocking pipe reader. It sends one
ready event, exact-PID exit events and requested fresh fact snapshots over its
private stdout pipe. Pipe loss ends the child. It cannot terminate processes,
resize panes, inspect unrelated conversations or execute arbitrary commands.
Snapshot request IDs and per-client generations reject late/stale responses.
Bound line length, PID count, request count, startup/request timeout and retries.
Reject helper executables outside 64 bytes..1 MiB before reading/hashing them.

Wire format: command-line `--parent PID --scope PID:MICRO_FILETIME ...`;
stdin `F REQUEST_ID PID ...` and `Q`; stdout JSON lines with `type` equal to
`ready`, `facts`, `exited` or `error`. Fact results use the existing `ProcessFact`
shape. No missing fact may be synthesized from the expected proof.

Windows native creation times have 100 ns precision while existing WMI proofs
have microsecond precision. Define one strict UTC timestamp conversion and compare
at that existing microsecond resolution. Verify real native/WMI equivalence and
reject a same-PID birth mismatch. Do not compare dates only at millisecond precision.
Process snapshots use Toolhelp and query handles, not WMI. Validate enumeration
completion and reject a process born after snapshot collection began, so PID reuse
cannot pair a new handle with an old parent/name entry.

## Viewer responsibilities

`ProcessMonitor` owns exactly one native child, its scope, status, pending requests,
timeouts and teardown. Its states are starting, verified, unknown, source-exited
and closed. Failure clears authority to resize, wakes the viewer, closes the old
child and schedules a five-second retry. Rebinding replaces the entire monitor;
old callbacks never affect the replacement. It is not a system-wide singleton.
Process exit suspends authority while the final stdout messages drain; it does not
destroy the stream before a possible confirmed-exit record. Drain is bounded to
six seconds. Cancelled requests ignore their late scoped errors as well as values;
unknown/future IDs and global protocol failures still invalidate the channel.

The existing file-event subscriptions remain wakeups, not ownership or liveness
proof. Keep their integrity reconciliation and exact thread/transcript binding.
Normal source closure also retains the existing host-record/control path.

Independent background jobs own Git and dynamic-height work. Telemetry reading
and painting do not await them. Jobs coalesce identical pending work, invalidate
on binding/config/geometry changes and discard results after cancellation. Their
completion wakes the main loop; pending deadlines never cause a busy loop.
Use existing visible telemetry while auxiliary work is pending or unknown.
Launch/retry the observer after publishing the current binding's telemetry, so
artifact verification and synchronous OS process creation cannot consume its first
paint window. A cancelled main-loop pass requeues its inputs: a stateful reader may
already have consumed a record before its derived display snapshot was committed.

The dynamic-height controller retains growth/shrink debounce, manual-size support,
the source's ten-row floor, ratio limits and fresh full-scope checks. Native facts
replace its recurring PowerShell lookup through its dependency interface. Slow
checks never use a newer generation's authority to mutate an older binding.
Investigate the known narrow-to-wide native fixture using physical backend data;
Node's cached `getWindowSize` is not independent physical evidence.
While a verified source's new height assessment is pending, suppress the pager
until capacity is known, then retain suppression only during actual growth.
Confirmed caps and query failure restore normal paging. This is display policy,
never authority to resize; it avoids a paging flash caused by painting before
the formerly blocking physical query finishes.

## Compatibility and failure policy

- Keep official Codex invocation/exit behavior, source metadata, Scope, task-handoff,
  profiles, hooks and other hosts unchanged by development and verification.
- Keep generic MCP activity; do not restore withdrawn MCP-specific features.
- Keep q/Ctrl+C semantics and in-place row painting.
- No recurring fallback to expensive PowerShell checks when native observation is
  unknown; show the existing safe warning and retry the native boundary.
- Initial complete ancestry and source-pane proof remain mandatory. A live handle
  is never sufficient proof that a pane or conversation belongs to this viewer.
- Preserve six-second identity request limits and existing test assertions. Add
  meaningful tests for the new behavior instead of relaxing timing or scope checks.
- Retain existing ignored evidence and unrelated untracked files. Product changes
  are local commits; publishing/reinstalling uses the project's separate workflow.

## Verification boundaries

Real child-process tests cover startup, exact birth, on-demand facts, independent
exit, parent exit, pipe failure, bounded malformed input and cleanup. Viewer tests
cover continued telemetry during stalled work, stop/rebind while work is pending,
helper failure and recovery, and no stale resize. Package tests run without source,
node_modules or a compiler, including Unicode paths and a modified helper binary.
Existing tests, native fixed/dynamic backend checks and measured four-observer
costs cover their respective boundaries; visual and long-term acceptance remain
separate. Record all concrete failures and their disposition.
