# Tool action and agent target display

> **For agentic workers:** Use superpowers:executing-plans and test-driven development.

**Goal:** Show targets only for agent operations; ordinary tools show action and duration.
**Architecture:** Add safe agent-operation metadata and render targets only for
those operations. Resolve known agent IDs to their recorded task names. Git
subcommands remain action verbs, not file/object targets.
**Spec:** The user's refinement to the MCP HUD design: ordinary tools omit file
names, directories, queries and other target objects. Agent operations retain
the task name/target. The subsequent MCP clarification leaves the current MCP
connection/call rules unchanged, including the unverified Official summary.

## Constraints

- No MCP, daemon, configuration, installed runtime or publication changes.
- Do not retain agent prompts/messages, arbitrary arguments or credentials.
- Preserve lifecycle state when late argument metadata enriches an existing tool.
- Preserve unknown tool namespaces and native selection/color/language support.

## Steps

- [x] Add failing tests for hidden ordinary targets, retained Git action verbs,
  named agent operations, and late metadata without lifecycle resurrection.
- [x] Add bounded safe agent metadata and localized labels; update rendering.
- [x] Verify targeted tests, complete serial suite and affected Node20 suites.
- [x] Review the change and record results without installing or publishing it.

## Verification

- Initial regression tests observed four expected failures for ordinary-target
  suppression, agent targets, and late metadata enrichment; focused checks then
  passed. The first serial full run passed 279/279.
- Independent review found canonical Extension completion could replace an
  existing target with a targetless action. A new regression observed RED before
  preserving the known same-kind target; final serial full suite passed 280/280
  (`npm test -- --test-concurrency=1`).
- Final Node20.19.0 affected suites passed 101/101. Late enrichment leaves status,
  native timestamps and reported duration unchanged; normal completion keeps the
  task name, without retaining message/prompt bodies.
- Source fixture output: `Start agent · hud_live_check · 500ms`, `Git status ·
  1.9s`, `Read file · 2.1s`; ordinary file targets are absent.
- MCP source/dist files and user configuration were not changed. No publication,
  installation, or live-viewer replacement was performed.
