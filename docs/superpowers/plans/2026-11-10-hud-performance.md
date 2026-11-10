# HUD Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove measured duplicate HUD work and proven redundant code, then improve discovery/startup where evidence supports a safe small change.
**Architecture:** Keep existing entry, reader, render and host boundaries. Reuse computation only within its existing freshness boundary; retain behavior and public configuration values.
**Tech Stack:** TypeScript, Node 20+, native Windows/PowerShell, packaged psmux.
**Spec:** `docs/superpowers/specs/2026-11-10-hud-performance-design.md`

## Global Constraints

- Node 20+, native Windows, zero JavaScript runtime dependencies.
- No Codex/Scope/profile/configuration/cache changes or automatic publish.
- No real Codex/model invocation for performance measurements.
- Preserve identity/source/ancestry/birth/pane checks and old remote compatibility.
- Full tests run serially with isolated configuration/origin.

## Review Focus

- A log is rewritten or replaced during reading: show retry/stale telemetry, never trust a reused pre-read hash after mutation.
- Dynamic height growth hides the pager only while growth is pending; errors retain warnings and original pagination.
- Git display is hot-switched or JSON is requested: collect facts when required.
- Unknown persisted configuration and quota label overrides remain unchanged.
- Delayed child sessions and duplicate IDs remain discoverable from verified metadata.

### Task 1: Runtime work reduction

**Files:** `codex-hud/src/{cli,reader,render}.ts`, relevant tests.
**Interfaces:** Keep existing SessionReader/read and render signatures; expose no new configuration.

- [x] Add failing regressions for idle reader I/O/allocation and relative-only timestamp formatting; verify RED.
- [x] Implement phase-local hash deduplication and deferred increment allocation.
- [x] Avoid duplicate viewer renders when rows/pager are unchanged; use one render timestamp.
- [x] Skip Git in text mode when disabled, keeping JSON and hot reload behavior.
- [x] Run reader/render/watch/dynamic-height/agent tests; compare synthetic baselines.

### Task 2: Proven redundant code

**Files:** `codex-hud/src/{pane-size,runtime,entry-resolver,config,host-launch}.ts`, `codex-hud/bin/terminal-viewport.ps1`, affected tests.
**Interfaces:** Preserve planInitialPaneSize and effective definitions; no production caller uses the removed legacy measurement API.

- [x] Capture effective definitions and use existing runtime/sizing/entry/config tests as equivalence evidence.
- [x] Delete obsolete measurement functions/helper and ineffective label argument/data.
- [x] Simplify unreachable demo/local-version conditions and duplicate native resolution.
- [x] Run focused package/runtime/sizing/config/menu/entry tests and compare definitions.

### Task 3: Discovery/startup follow-up

**Files:** determined from read-only subagent evaluations; constrain changes to existing HUD discovery/entry modules and regressions.
**Interfaces:** Exact transcript metadata and parent relationships remain authoritative; entry fallback must never execute official Codex twice.

- [x] Review measured candidate tradeoffs; record the chosen local optimization.
- [x] Add behavior/cost regression, observe RED, implement and verify GREEN.
- [x] Repeat synthetic discovery/entry measurements; reject approaches without useful evidence.

### Task 4: Verification and review

- [x] Build and run the serial full suite once after implementation, with isolated HUD environment.
- [x] Run relevant Node 20/offline tests and check the final diff.
- [x] Dispatch a fresh independent reviewer for the complete change; resolve material findings with regression evidence.
- [x] Commit only this task's files, without AI attribution; do not push or publish.
- [x] Report measured scope, verification and remaining real-terminal acceptance.

## Execution evidence and decisions

- Task 1: four cost regressions observed RED (reader 7 versus 4 reads, relative
  timestamp 6 versus 0 absolute formatting calls, disabled text Git 1 versus 0
  commands, viewer 8 versus 4 render calls). Focused suite then passed 108/108.
- Task 2: cleanup suite passed 34/34. Serialized effective definitions, including
  RegExp and extra.label overrides, exactly matched the captured baseline.
- Task 3: serial discovery regression observed RED, then related suite passed
  68/68. Fixed 8-worker reading retains enumeration positions and complete scans;
  all workers settle before a close failure propagates. No metadata cache or
  filename-based identity shortcut was added.
- Decision: keep the startup process structure and fresh physical source checks.
  Merging the preflight and entry workers requires a commit/IPC protocol to handle
  process.exit/crashes without retrying a session that may already have started.
  Component-only Node startup median was about 243 ms; no real startup benefit
  justifies that protocol change here. Native frontend duplicate resolve alone
  was removed. Process helper alternatives had no demonstrated speed advantage.
- Synthetic paired Node 24.15.0 samples, 1000 metadata-only files:
  discovery before 959/1058/717 ms, after 175/173/254 ms; 1000 renders before
  398/528/734 ms, after 234/195/320 ms. These are component measurements on this
  machine, with other verification work occurring, not real launch benchmarks.
- Idle reader reads per tick fell 7 to 4, bytes 28672 to 16384, increment-buffer
  allocations 1 to 0. Timing did not improve consistently (20 reads before
  26/23/44 ms, after 29/46/33 ms); claim reduced I/O/allocation only.
- Full serial performance-version verification passed 308/308, 0 failures/skips.
- Independent whole-change review found no Critical/Important/Minor issues.
  Reviewer additionally checked configuration deep equivalence and worker close
  failure cleanup. Real launch time/interactive sizing/long-term stability were
  explicitly left unverified; they require actual user-terminal acceptance.

### Additional user request: Section headings

**Files:** `codex-hud/src/{render,config,menu-help}.ts`, generated dist and `test/agent-display.test.mjs`.
**Interfaces:** New semantic heading foreground defaults to #bac2ce without rewriting saved configuration; existing row colors and rendering interfaces stay intact.

- [x] Observe RED for icons/heading foreground, then add single-cell monochrome icons and heading color/help.
- [x] Verify all three languages, expanded/compact layouts, narrow widths, active/inactive row separation and NO_COLOR; final UI-related suite passed 73/73.
- [x] Complete Node 20/offline checks and narrow independent review of this additional UI change.

Final-version Node 20.19.0 related/offline checks passed 168/168, no failures or
skips; the additional interactive menu suite passed 15/15. The narrow UI review
found no correctness issues. Performance checks remain supported by the earlier
308-test full run; after the UI addition, all affected render/config/menu/height
checks were rerun (73 + 15), without repeating unrelated unchanged suites.
The existing installed HUD and user configuration were not changed by this work.
