# HUD performance implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Reduce HUD polling overhead without weakening source identity or backend validation.

**Architecture:** Use filtered managed WMI for explicit periodic identities while
preserving the original startup/hook ancestry snapshot, then
reduce redundant physical queries and validated-file reads. Keep discovery
bounded to the metadata line. Preserve current public interfaces where possible.

**Tech stack:** TypeScript, Node 20+, Windows PowerShell 5 / PowerShell 7, System.Management.

**Spec:** `docs/superpowers/specs/2026-11-09-hud-performance-design.md`

## Global constraints

- Do not change Codex, daemon/trust state, backend binary, UI, user configuration,
  or installed/live viewers. No additional dependencies or compiler toolchain.
- Identity remains PID + name + parent + creation time; no latest-session or
  title inference. Full physical and process validation precedes every resize.
- Preserve existing tests and evidence boundaries; source tests are not a new
  machine or installed-live-viewer acceptance.

## Review focus

- PID exit/reuse while collecting a snapshot must not become a false proof.
- Legacy CIM creation timestamps must still match the managed query exactly.
- A stable height cache must never authorize a mutation or hide replacement registration.
- A same-size backend rewrite with restored mtime, replacement, or changed pin
  must invalidate successful verification.
- Metadata crossing chunk/UTF-8 boundaries must preserve identity and parent;
  over-limit metadata must not turn into a partial identity.

## Task 1: Process identity snapshot

Files: `codex-hud/bin/process-facts.ps1`, `codex-hud/src/psmux.ts`,
`codex-hud/src/cli.ts`, `codex-hud/src/dynamic-height.ts`, corresponding dist,
and `codex-hud/test/psmux.test.mjs`.
Keep `readProcessFacts(pids, rootPid): ProcessFact[]` for ancestry; add
`readProcessIdentities(pids): ProcessFact[]` for periodic explicit identities.

- [x] Add helper tests: explicit IDs and real ancestry, unrelated PID
  exclusion, no CIM cmdlet initialization, legacy creation-time precision, unknown required identity.
- [x] Observe the new tests fail against the current helper.
- [x] Implement filtered managed WMI with explicit disposal; keep full ancestry
  for callers that establish hook/owner provenance. Reject reusing partial
  identities as ancestry and keep the actual caller as root.
- [x] Run the targeted suite and native PS5/PS7 timing comparison.

## Task 2: Stable dynamic height polling

Files: `codex-hud/src/dynamic-height.ts`, `codex-hud/src/cli.ts`,
`codex-hud/test/dynamic-height.test.mjs` and generated dist.
Extend `fit` with optional terminal geometry, preserving existing callers.

- [x] Test stable polling suppression and timed/geometry/content/config
  invalidation; retain mutation identity checks and existing debounce tests.
- [x] Observe RED, implement stable-observation throttling, run targeted tests.

## Task 3: Backend verification reuse

Files: `codex-hud/src/backend-version.ts`,
`codex-hud/test/backend-version.test.mjs` and generated dist.
Keep `verifyBackend`, `packagedBackendPath`, `effectiveBackendPath` signatures.

- [x] Test repeated packaged selection avoids binary re-reading and rejects
  same-size rewrite/restored mtime, replacement, missing binary, changed pin.
- [x] Observe RED, implement bounded successful-verification cache with
  pre/post metadata checks, run backend and host regression tests.

## Task 4: Bounded metadata reads and final verification

Files: `codex-hud/src/sessions.ts`, new `codex-hud/test/sessions.test.mjs`,
generated dist and README performance note.

- [x] Test short metadata with large body reads only a small head; large/split
  UTF-8 metadata, duplicates, parent IDs and over-limit lines retain behavior.
- [x] Observe RED, implement chunked metadata reads, run discovery/reader tests.
- [x] Run the full suite and Node20 affected tests. Benchmark source query,
  hash, stable-height and discovery paths with aggregate-only output.
- [x] Independent whole-change review; fix substantive findings with regression
  tests. Report source results and remaining installed-runtime validation.

No push, publication, installation, or live viewer replacement is included.
