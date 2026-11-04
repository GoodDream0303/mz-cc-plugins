# HUD first use, live height and agent lifecycle

## Intent and scope

A new Windows user installs official Codex and this marketplace package, completes
one guided initialization, and keeps using `codex` and `codex resume`. HUD height
can follow visible content, and agent status reflects reported lifecycle facts.
Tool activity also updates from start, completion, failure and cancellation
metadata; long-running/yielded commands remain active until a final result.
This change is developed in the existing HUD worktree; it does not publish,
reinstall, change live profiles, or start another official/model session.

## Approach

Reuse `hud-start` as the manifest's official onboarding skill and the existing
PowerShell setup preview/apply path. Check Node before invoking Node diagnostics:
native Codex alone does not supply a public Node executable. Explain missing
prerequisites and offer supported installation or an explicit portable runtime;
dependency installation requires the user's choice. Native hook review remains
in `/hooks`. Setup is one-time; ordinary commands remain unchanged.

Keep initial sizing and fixed/manual sizing compatible. Add a separate
`terminal.dynamicHeight` switch, off for existing/default configuration unless
chosen. Fresh guided initialization recommends enabling it and shows the exact
setting in its preview. While enabled, content determines height (including
wrapping and warnings); the current ratio caps growth and at least ten source
rows remain. Growth waits one stable refresh and shrink waits two seconds.
Manual dragging is preserved with dynamic mode off; with it on, content fitting
resumes after the debounce. Resize only the verified source's distinct HUD pane;
changed server, process, registration or window identity prevents resizing.
Backend/inspection failures keep the current pane and display a short warning.

Track agents by real thread ID or v2 agent path, linking spawn call IDs to that
identity. Consume Codex 0.166 canonical collaboration/activity events and retain
legacy tool-result/event compatibility. Normalize only lifecycle variants:
starting, running, interrupted, done, failed, closed, not-found, unreported.
Tool-call completion alone is not agent completion. Preserve original task names;
never retain prompts, completion bodies or arbitrary tool results. Unknown
metadata is displayed as status not reported rather than guessed as running.
Show the actual model alongside each agent, taking it from resolved spawn or
canonical activity metadata and keeping it through later events. A requested
model or parent model is not proof of the child's resolved model; missing data
is displayed as model not reported. Agent models are independent of the parent
identity's hidden-by-default model field.

Tool updates use the existing refresh interval (one second by default), without
restarting the viewer. Explicit canonical in-progress status takes precedence
over an item-completed delivery wrapper. Correlate yielded process/session IDs
through polling; a poll returning is not proof the underlying command finished.
Keep running tools visible ahead of recently finished tools within the existing
visible-item limit. Preserve bounded, metadata-only state and localized labels.

## Alternatives and decisions

- Zero-step installation cannot establish the existing PowerShell host or native
  hook trust; the user chose one guided initialization.
- Replacing initial auto-height would silently change existing manual sizing;
  a separate live-height switch makes the behavior explicit.
- Guessing agent activity from tool completion repeats the current identity bug;
  canonical events plus correlated result metadata provide actual evidence.

## Acceptance

- The installed manifest resolves a packaged onboarding skill. Its first-use
  instructions handle native Codex with missing Node, an existing portable Node,
  separate PS5/PS7 profiles and an already configured installation.
- Existing isolated setup/package tests remain green; no live profile is changed.
- A synthetic native backend fixture demonstrates 3 -> 6 -> 3 visible rows,
  bounded growth, source survival and unchanged geometry in another server.
- Fixed sizing sends no resize commands. Wrong owner/server/viewer identities
  cannot issue a resize. Narrower widths account for wrapped rows.
- Spawn, completion, failure, close, resume, timeout and duplicate/replayed
  metadata preserve a single agent identity and do not retain content text.
- Tool start/finish/cancel and yielded-process polling update incrementally;
  long-running tools remain visible while newer quick calls complete.
- Full plugin suite passes. Fresh Windows installation and actual multi-session
  keyboard/mouse acceptance remain separately identified if not performed.
