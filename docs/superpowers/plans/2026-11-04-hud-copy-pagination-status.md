# HUD copy, transient pagination and missing agent completion

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development for this focused correction.

## Design and constraints

- Suppress only the pager footer while the verified dynamic-height controller is
  waiting to grow. Keep clipped output within the actual viewport, keep warnings,
  and show normal pagination once the cap is reached or fitting is unavailable.
- Ctrl+C must not close the HUD. Keep q and the explicit scoped stop command.
  Clipboard selection/copy remains the terminal host's responsibility.
- The observed hud_demo_2 worker completed, but its parent lacks the completed
  activity event and final delivery. Supplement active agents from their exact
  child session IDs, validating the recorded parent relationship. Read lifecycle
  and model metadata only; do not infer completion from text or call an agent API.
- Reuse incremental SessionReader for child logs. Cache child readers/paths,
  bound discovery retries, reject ambiguous identities, and compare child event
  time with the latest parent activity so old completion cannot undo a resume.
- Preserve the official CLI, native statusline, existing fixed sizing, source
  ownership checks and unrelated files. Publication uses the user's existing
  update authorization for this same release acceptance/correction cycle.

## Tasks

- [x] Add a render regression for a suppressed footer without extra output rows,
  and controller regressions for growth-pending versus capped/fixed states.
- [x] Implement the growth signal and pass it to rendering before displaying a frame.
- [x] Add native Ctrl+C survival and q-close checks to the existing smoke, observe
  the failure, then remove only Ctrl+C's close binding and update the README.
- [x] Add child metadata and supplemental-reader regressions: missing parent
  completion, wrong parent, duplicate identity, stale completion after resume,
  child interruption and incremental completion/model updates.
- [x] Record lifecycle timestamps and expose parent activity time without changing
  the displayed Agent shape. Integrate the bounded child-session reader in watch.
- [x] Verify the current actual demo worker becomes done through the same reader.
- [x] Run the full plugin suite, relevant Node 20 checks and native smoke.
- [x] Obtain one independent review, address material findings and report scope.
