# HUD performance and redundant-code cleanup

Approved in the current conversation: implement the first batch, then continue
the startup and session-discovery investigation and useful follow-up changes.

## Intent and constraints

Reduce work performed by the existing HUD without changing its display,
configuration, provenance, lifecycle or privacy behavior. Keep Node 20+, native
Windows, the packaged psmux backend and zero JavaScript runtime dependencies.
Do not change Codex, Scope, profiles, user configuration or installed caches.
Do not launch a real Codex/model request for measurement. No automatic publish.

## Approach

Use local, measurable reductions in duplicate work first. A broader entry
architecture rewrite and persistent session index have greater correctness and
maintenance costs; investigate their smallest alternatives after the first batch.
The original three read-only reviews inform the implementation, but each change
still needs regression evidence and the complete diff gets independent review.

## First batch

- Re-render a fitted viewer only when viewport height or pager mode changes.
- Format absolute timestamps only in formats that display them.
- Defer the reader's 64 KiB increment buffer until data exists. Reuse hashes of
  identical byte ranges within each validation phase, never across the before
  and after phases. Preserve replacement, rewrite and during-read detection.
- Skip Git collection for text display when Git is disabled; retain JSON facts.
- Remove the unused terminal-viewport chain, ineffective definition labels and
  unreachable demo/manifest branches, preserving physical pane sizing and all
  active old-remote compatibility checks.

## Follow-up

Investigate session discovery and startup using synthetic input and bounded
component measurements. Preserve exact metadata/parent checks, duplicate-ID
handling, discovery of delayed files and proof freshness. Implement only changes
with a clear benefit and a small reviewable contract; record why riskier ideas
are rejected rather than claiming an unmeasured startup improvement.

## Section headings

The user additionally requested icons and a small brightness adjustment for
Current/Recent/Agents and similar headings. Use one-cell monochrome glyphs:
`▸ Current`, `◷ Recent`, `◈ Agents`, `≡ Todo`. Give headings the soft gray-blue
`colors.heading` default `#bac2ce`; retain separate active/inactive/critical row
colors, localization, compact layout, narrow wrapping and NO_COLOR behavior.
Do not rewrite the user's saved configuration to add the new default.

## Acceptance

Relevant regressions and serial full suite pass; Node 20/offline behavior stays
supported. Re-run the same synthetic render/reader/discovery measurements and
report their scope. Independent review has no unresolved material findings.
Real startup duration and long-term stability remain user acceptance items.
