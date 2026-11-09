# HUD refresh performance

## Intent and scope

Reduce the measured background cost of HUD 0.7.5, in the order requested:
process identity queries, dynamic height polling, repeated backend validation,
and session metadata discovery. Preserve the UI, current user configuration,
physical source binding, and supported native Windows / Node 20+ environments.
This is a source change; publishing, installing, and switching live viewers
are separate operations.

## Evidence and approach

The installed viewer's own CPU was small, but its PowerShell process queries
dominated the measured host chain. A filtered CIM query for each ancestor was
also measured and was slower than the existing full CIM snapshot. A native
Tool Help candidate was also measured; its per-invocation Add-Type compilation
cost made it unsuitable. Direct managed WMI over the entire table was then
measured and also failed to reduce CPU reliably. Keep the original full
ancestry snapshot for startup/hook proofs. For periodic liveness and resize
identity checks, use an explicit `readProcessIdentities(pids)` path backed by
the built-in .NET ManagementObjectSearcher with a PID filter. Include the actual
caller, return only requested identities, and never use that partial result
as a hook ancestry proof. Preserve PID/name/parent/creation time and the UTC
timestamp format; dispose the snapshot objects and add no runtime, downloaded
module, or compiler toolchain.

For height, skip physical queries while content/configuration/terminal geometry
are stable, with a five-second maximum recheck interval. Never resize from a
cached observation: debounce and all existing identity and scope checks remain
in force before a mutation. Registration is checked on every call.

For the packaged backend, reuse a successful hash only while the binary's
identity, size, modification/change times, and pin remain unchanged. Check
metadata before and after hashing. Missing/replaced/changed artifacts invalidate
the result; invalid results are not cached. Do not alter the pinned digest,
Codex trust state, daemon, or backend executable.

For discovery, read the metadata line in 4 KiB chunks up to the existing
256 KiB limit instead of reading 256 KiB from every log. Keep duplicate/parent
verification, symlink handling, and discovery cadence unchanged.

## Acceptance

- Tests protect ancestor and explicit PID identity, unknown live identity,
  stale source/viewer/pane rejection, debounce/caps, changed binary/pin,
  and large or split UTF-8 metadata.
- Existing full suite passes; targeted native checks run on Windows PowerShell
  5 and available PowerShell 7, with Node 20 compatibility checks.
- Measure the real read-only queries before/after and record timings separately
  from synthetic tests. Do not infer installed-viewer CPU improvement before
  a new release is installed and measured.
- No model self-test requests, clipboard access, live pane mutations, dependency
  installation, or automatic publication during this work.

## Verification results

Same Windows host, Node 24.15.0, comparing the installed 0.7.5 implementations
with the development implementations. Timings are component measurements, not
an installed-viewer CPU acceptance or a clean-machine acceptance.

| Component | Before | After | Measurement |
|---|---|---|---|
| PS5 periodic identity query CPU | 1703 ms | 1578 ms | Median of 3 alternating standalone calls; exact owner creation time matched |
| PS7 periodic identity query CPU | 1500 ms | 1328 ms | Same method; startup/hook full ancestry path retained |
| Packaged backend selection | 11.193 ms | 0.429 ms | Median of 20 calls, including an initial cold verification |
| Stable height physical queries | 30 | 6 | 30 synthetic one-second refreshes, no real pane operations |
| Session metadata bytes | 28.917 MiB | 3.231 MiB | 139 real session files, aggregate-only output |
| Session metadata discovery | 232.509 ms | 161.145 ms | Median of 3 calls per implementation |

- Baseline full suite: 246/246 passed.
- Final Node 24 full suite: 256/256 passed (`npm test`).
- Node 20.19.0 affected suites: 87/87 passed, including process identity,
  dynamic height, backend validation, sessions/reader/agents, package and TTY.
- Independent read-only review, including the filtered-identity revision: no
  blocking findings. Added coverage for artifact changes during hashing.
- Existing installed viewers, configuration and backend pins were not changed.
  Total live CPU, responsiveness and memory after installation remain to be measured.
