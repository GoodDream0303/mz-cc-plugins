# HUD active text emphasis

User-approved target: the text-only preview shown on 2026-11-09. Highlight active tool calls and starting/running agents with bright foreground text; use readable gray for recent tools and inactive agents. Keep the background and font weight unchanged. Preserve existing tool failure coloring.

`Agents:` (or its localized label) occupies its own line. All agent entries use two spaces of indentation, including wrapped continuation lines. No blank line is inserted before the heading. Current and Recent tool summaries occupy separate lines when both exist, matching the preview. Keep existing counts, retention, row limits and pagination semantics.

Approaches considered: full-row background highlight (rejected by user), activity markers (not selected), foreground text emphasis (selected). Add semantic configurable `colors.active` and `colors.inactive` defaults matching the preview, rather than overriding unrelated label colors. Respect `color:false` and `NO_COLOR`.

This is a rendering change in the existing worktree. Do not change lifecycle inference, selection handling, installation, host processes or plugin version. Build tracked dist files; publishing and reinstalling require a separate user request.
