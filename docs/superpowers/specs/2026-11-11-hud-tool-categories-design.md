# HUD tool categories and whole-group wrapping

The user approved mockup V4 and explicitly requested implementation. The goal is
to explain what command/script calls do without displaying their commands,
arguments, paths, script bodies or outputs.

## Agreed behavior

- Two major categories: Run command / 执行命令 / 執行命令 and
  Run script / 执行脚本 / 執行腳本. The actual core tool identity determines the
  major category; PowerShell, Python and Node are execution mechanisms.
- Minor categories describe operations: read, search, list, edit, copy, move,
  delete, archive, Git, build, test, check, benchmark, dependencies, environment,
  processes, network and wait. Git's known verbs remain safe action labels.
- Preserve Current and Recent. Aggregate equal minor categories within a major
  category and status; count distinct logical calls, not polling responses.
  Running counts and completed counts remain separate. Keep failure/cancel
  indicators and existing foreground colors; failure is not a successful count.
- A call with several known operations has a combined minor label, for example
  Read + Search, counted once. Never claim a multi-operation call is only its
  first operation. Unknown work remains explicitly unclassified.
- Display major groups together on one line when they fit. Move a complete group
  to the next line when it does not fit the remaining space. Do not split an
  ordinarily sized group into orphan minor labels such as Environment.
- Show every observed minor category; no '+N more' folding for command/script
  categories. Existing toolsMaxVisible continues to limit unrelated tools.
- A finite terminal cannot hold an arbitrarily long group on one physical row.
  If a group exceeds a whole row, use shorter localized major labels and repeat
  the major label on continuation rows. Keep all minors and counts, keep terminal
  cell-width bounds, and only split within one minor as a final narrow-width
  fallback. This is an implementation fallback, not another layout mode.
- Keep current 60-second completion expiry, unknown-age handling, native
  lifecycle precedence, paging, height calculation, three languages and NO_COLOR.

## Approaches

The discussion compared per-call timelines, aggregation by category, and only
showing the latest operation. The user selected aggregation, then clarified:
no dedicated row per major, no folded categories, and whole-major wrapping.
V4 is at C:/Users/mzzhu2/Downloads/codex-hud-mockups/hud-tool-categories-v4.drawio.png.

## Implementation decisions

Prefer structured command actions. Otherwise inspect only bounded, static input:
known command names, common PowerShell/bash/cmd wrappers, known test/build
invocations, and literal tools.exec_command calls in orchestration scripts.
Do not execute scripts, read referenced files, decode encoded shell programs,
infer behavior from arbitrary script filenames, or classify quoted text as code.
Reject unsupported/dynamic syntax conservatively. Retain only fixed operation
identifiers, existing safe Git verbs/basenames, and agent targets; no raw input.

Keep existing tool action kinds for compatibility and add a fixed minor-operation
union plus mixed-action metadata. Extract command classification and tool display
into focused modules. Existing native/response events for a call enrich the same
record; late metadata must not restart or duplicate its lifecycle.

No new runtime dependency, configuration migration, background service or MCP
special UI. Do not modify Codex, Scope, handoff code, user configuration or other
sessions. Node 20+ and native Windows remain supported. Build checked-in dist.
No automatic version bump, release, push or reinstall.

## Verification

Tests must first fail for wrapped read/search commands, combined operations,
quoted decoys, unknown/dynamic scripts, and script orchestration literals.
Replay synthetic canonical/response events in both orders and polling output.
Render both layouts in all languages, aggregate counts by status, retain every
minor despite a low toolsMaxVisible, and move complete groups at a measured width.
Cover oversized/narrow groups, ANSI/NO_COLOR and preservation of paging/height.
Run the final serial full suite once, with test config/origin isolated. Use
historical baseline results only within their recorded scope. Independent review
checks this feature; no real Codex/model request or installed-HUD mutation.
