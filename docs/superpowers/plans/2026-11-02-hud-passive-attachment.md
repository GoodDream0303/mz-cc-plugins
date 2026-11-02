# Passive HUD revision

The user follow-up supersedes the v0.1 launcher design: retain native statusline,
disable duplicate identity fields by default, do not display/manage session ID,
and attach to the existing thread using Codex-provided environment identity.
Remove hook registration/trust and all Codex-launch/daemon/environment-relay code.

Explicit --session wins, followed by CODEX_THREAD_ID and CODEX_SESSION_ID.
Missing identity requires explicit selection; never guess the latest log.
Default Terminal target is its most recently active window; --window selects
a known ID/name. Passive lifetime belongs to the user through q/stop/window close.

Implementation: simplify runtime/start, remove hooks, update defaults/presets
and current local preferences, retain reader/render/config/recovery behavior.
Release 0.2.0 and refresh local cache. Validate hook-disabled attachment, native
statusline preservation, fixed session selection, split behavior and applicable
regression tests; independently review the revised attachment path.
