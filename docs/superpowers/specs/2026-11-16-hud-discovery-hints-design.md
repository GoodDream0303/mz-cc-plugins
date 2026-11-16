# Bounded child discovery hints

The user approved continuing from the isolated A/B experiment on 2026-11-16.
Implement the measured discovery optimization in the existing HUD worktree;
release, installation and migration of live viewers are outside this change.

## Behavior

When an agent transcript is unresolved, unrelated session-directory changes
currently bypass the five-second discovery interval and reread every metadata
head. The approved prototype reduced that pressure from about 27.37% to 2.14%
CPU for four synthetic sources, with improved measured write latency. These
figures describe the prototype under its stated workload, not normal-use savings
or the final implementation. Evidence is in the ignored workspace
`.superpowers/sdd/2026-11-16-hud-resource-ab/evaluation.json`.

Keep the existing five-second full discovery fallback. Between full scans,
inspect only bounded changed-file hints. Unrelated metadata cannot trigger a
full scan. A hint matching an unresolved child and its exact parent triggers a
fresh full scan before a reader is bound: this retains the existing rejection of
duplicate matching IDs, which the prototype did not exercise. Repeated hints for
a known ambiguous child wait for the same five-second retry boundary.

## Approaches

- A global five-second throttle is small but would delay ordinary child creation.
- The selected approach uses changed-file metadata to reject unrelated changes
  cheaply, with the existing full scan confirming new bindings and providing
  fallback for missed or nameless notifications.
- A cross-session index or shared daemon would add state, routing and lifecycle
  work beyond this repair.

The user accepted the second direction. Fresh uniqueness confirmation is a
production compatibility refinement, not a relaxation of source verification.

## Boundaries and interfaces

- `RefreshEvents.takeDiscoveryFiles(): string[]` drains at most 256 distinct
  `.jsonl` paths from active recursive discovery watches. Reject paths outside
  the watched root, ignore retired handles, and clear storage on close. Hints
  remain scheduling data, never source, binding or resize authority.
- `readSessionHints(root: string, files: readonly string[]): Promise<SessionInfo[]>`
  reuses the bounded metadata reader used by `listSessions`. Limit each batch to
  256 paths and eight workers; reject lexical/canonical escapes and symlinks.
  Continue to read at most 256 KiB of the first metadata record per file.
- `AgentSessionTracker.refresh` accepts optional `files: readonly string[]`.
  Exact ID plus exact parent matching and fresh full-scan uniqueness still
  precede creating a `SessionReader`. Preserve completed-agent model recovery,
  known-child lifecycle/timing and invalidation behavior. Bound ambiguous retry
  state to currently retained agents.
- The viewer passes discovery paths into that refresh. Existing cancelled-pass
  retries, control checks, painting and background jobs stay in place.

## Constraints

- Native Windows and Node 20+; no new runtime dependency, service or user setting.
- Five-second full discovery fallback, 25ms notification merge and all existing
  source/ancestry/birth/physical-pane checks remain.
- No changes to official Codex, Scope, task-handoff, profile/PATH, hooks/trust,
  installed cache, backend/native binaries or the running user sessions.
- Keep original text/record bounds and metadata-only discovery. Persist no real
  conversation, reasoning, credential or captured screen content.
- Use serial isolated tests. Do not loosen existing limits or assertions.
- Preserve existing ignored evidence and the untracked task-handoff pycache.

## Completion

Observe targeted regressions failing on the baseline, then passing on source and
built dist. Verify noisy unrelated events, fast standard/nonstandard child
creation, partial metadata, duplicate IDs, wrong parents, missed notifications,
path/symlink boundaries, retired watches and known-child completion. Run the
full serial suite, the existing native production fixture, and an isolated
four-source measurement using the final built behavior. One independent review
must leave no unresolved Critical or Important finding. Report remaining scope
limits; ordinary idle savings and real visual/long-term acceptance are not claims.
