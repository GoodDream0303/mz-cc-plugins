# Agent task lines and tool summaries

Use the existing HUD worktree and test-driven development. The user approved
the preceding concrete display proposal; implement it directly.

## Display contract

- One agent per logical row: original task name, status/current structured plan
  step or running tool, actual model, elapsed current task time, and this child's
  cumulative reported tokens. Never use the parent tokens or message bodies.
- Starting/running/unknown work has priority. Show at most three agent rows by
  default, fill remaining slots with at most two recently ended agents, and age
  reported completions out after 60 seconds. Unknown completion times remain
  bounded rather than being invented. A +N running summary indicates hidden work;
  display.agentsMaxVisible=0 permits all rows through the existing pager.
- Completed timers freeze at their reported end time. Missing time/token/model
  data is explicitly unavailable. Child identity/parent/timing checks remain.
- Tool summaries group by full tool name and terminal status. Keep active calls
  visible and separate success, failure and cancellation counts. No new I/O.
- Preserve fixed sizing, copy-safe input, exact-host binding and source policy.

## Tasks

- [x] Add failing renderer tests for rows, live/frozen time, child-token labels,
  active priority, completion retention, overflow and status-specific tool counts.
- [x] Add failing child metadata tests for lifecycle timing, structured action,
  tokens, late old data, missing data and unchanged parent terminal state.
- [x] Implement parent timing fallback and child detail enrichment.
- [x] Implement bounded agent rows and tool summaries with localized menu help.
- [x] Run focused/Node20 checks, full suite and native production-backend smoke.
- [x] Review independently, fix material findings, then use the existing update
  authorization to publish, install and inspect the current real HUD.
