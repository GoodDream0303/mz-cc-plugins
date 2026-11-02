# Minimal HUD autostart implementation

The user chose a minimal SessionStart hook to open the existing companion HUD
automatically. This supersedes the no-hook trigger requirement, while preserving
native statusline, no new Codex process, hidden identity fields, and English UI.

1. Add startup.enabled (default true) and startup.window (default last).
2. Add a quiet plugin hook for startup/resume only. Read bounded stdin and the
   supplied transcript metadata; reject missing/mismatched identity, non-CLI
   sources and subagents. Use transcript metadata id for fork-safe thread identity.
3. Reuse the existing Terminal attachment renderer/argv path. Pass the known
   transcript path to the watcher rather than guessing recent session logs.
4. Hold a per-session lock and inspect owned display metadata for an active or
   pending pane before opening. Ignore compact events; allow reopening after
   an owned display has exited. A failed pane launch must not poison deduplication.
5. Hook stdout remains empty: no prompt/developer context, no model request,
   no dependency install, no Codex launcher/security/daemon changes.
6. Keep manual attach usable without hooks. Doctor reports autostart enabled,
   hook file availability and unknown trust separately.
7. Test startup/resume, concurrent deduplication, subagent/non-CLI/compact skips,
   disabled config, metadata identity validation, failed-launch recovery, empty
   stdout, direct transcript selection and the actual Windows Terminal hook path.
8. Release 0.3.0, review the change, run the suite and install the local plugin.
   Hook trust remains a user action through Codex /hooks; do not edit trust hashes.
