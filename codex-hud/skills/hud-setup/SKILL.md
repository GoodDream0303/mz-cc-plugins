---
name: hud-setup
description: Use when Codex HUD needs first-time initialization after installation or setup in another PowerShell host.
---

# Initialize Codex HUD

Use this skill for the one-time environment/profile setup. For a configured
conversation whose HUD is missing or closed, use [hud-start](../hud-start/SKILL.md).
Resolve the installed plugin root two directories above this skill; do not use a
global npm link or build a published package.

1. Check for an existing Node20+ runtime. If missing, explain the prerequisite and
   obtain the user's choice before installing anything or selecting a portable
   runtime. Do not change PATH automatically. The package supplies dist, vendor
   dependencies, licenses and its checksum-pinned psmux backend; no compiler or
   user npm install is needed.
2. Run `node "<plugin-root>/bin/hud.mjs" doctor`. Runtime prerequisites, native
   hook trust and actual interactive acceptance are separate results.
3. In each PowerShell 5/7 host the user uses, resolve that host's actual profile.
   Preview `bin/setup.ps1 -Enable`, or `setup --profile <absolute-profile-path>
   --initialize --enable` through the installed Node CLI. Show concrete loader,
   profile and settings changes before writing a real user profile. Existing
   explicit display/runtime preferences remain authoritative. For a fresh setup,
   recommend dynamic content height in the preview, applying it only if chosen.
4. Apply the concrete authorized setup, then direct native hook review to Codex
   `/hooks`. Never modify trust hashes, bypass approval, enable a shared daemon
   or test by starting another real Codex/model request implicitly.
5. A live ordinary Codex cannot be moved into psmux retroactively. After the user
   finishes it normally, use the unchanged `codex` or explicit `codex resume ID`
   from the initialized shell. Verify the actual host, source pane, thread and
   independent HUD; do not use MRU, focus or a window title.

Keep legacy `startup.enabled=false` when old unsafe 0.3.4 sessions may coexist;
explicit `host.autoStart=enabled` controls exact-host opening. PS5/PS7 profiles
are separate. `host.runtime=cli` remains the default. Automatic localAppServer startup from
0.7.9 is retired for compatibility; do not enable it or change the CLI backend. Normal upgrades of the stable loader do not need repeated setup.
Older version-bound/0.5.1 bootstrap installations need the previously documented
one-time loader refresh, not a second initialization on every upgrade.
