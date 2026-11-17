# HUD public progress line

The user approved the terminal mockup at
`C:/Users/mzzhu2/Downloads/codex-hud-progress-mockup/codex-hud-progress.drawio.png`.
Add one terminal row describing what the bound main conversation is doing.

## Behavior

- Enable `display.showProgress` by default; expose its existing menu toggle and
  translated help. Use a configurable `colors.progress` foreground, initially
  `#89e3bd`, and place the row before tool activity, including old order arrays.
- While working, prefer the latest explicitly public assistant `commentary`,
  otherwise this turn's in-progress plan step, then a current tool's existing
  safe activity label, otherwise the localized Working label.
- Accept legacy public agent-message events, assistant response messages and
  completed canonical AgentMessage items only when explicitly commentary.
  Exclude reasoning, final/partial answers, user messages and unclassified text.
- Retain only a bounded, normalized excerpt in the reader's memory. Do not save
  message text, query services, or request model-generated summaries.
- Reset excerpts and this-turn plan fallback at task start, completion,
  interruption, compaction, log replacement and session rebind. Existing todo
  history remains intact. Old tools do not become a new turn's progress fallback.
- Show Idle/Interrupted after terminal lifecycle events, with no old text or
  elapsed clock. Unknown sessions do not gain a speculative progress row.
- Fit a single row to terminal cell width, preserving elapsed turn time where
  room allows. Keep three languages, NO_COLOR, paging and native sizing behavior.

## Approach

Extend the existing reader/snapshot, renderer, configuration and display deadline.
Reuse safe tool labels and the existing event-driven refresh path. This directly
implements the approved mockup without a new service, log scan or agent call.
Progress does not follow sidebar focus; the prior side-chat binding fix remains.

## Acceptance

Synthetic tests prove public-text selection, fallback order, bounded output,
safe terminal rendering and lifecycle clearing. Native synthetic-host checks
cover the new row and clearing in a real psmux viewer. Actual user sessions,
hook trust, Node 20 and long-term visual behavior remain separate acceptance.
