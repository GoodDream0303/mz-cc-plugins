---
name: hud-start
description: Use when the user wants an independent Codex HUD in PowerShell tabs or windows, or needs to reopen the current conversation's HUD.
---

Resolve this plugin root two directories above the skill. Use its direct
`node "<plugin-root>/bin/hud.mjs"` entry; a global npm link may target older code.
Published packages include dist. Build only an explicitly selected source checkout.

On a new Windows environment, check that Node 20+ is available before invoking
JavaScript. `bin/setup.ps1` is the PowerShell-first entry: it explains a missing
Node prerequisite and accepts an explicit portable `-NodePath`. Published packages
include a checksum-pinned compact backend; fresh defaults select it without a
Rust installation. Preserve an existing explicit backend choice.

Run `doctor` first. It distinguishes configured psmux from present origin metadata;
`origin: present` is not live ownership proof. `start` verifies that proof itself.
Read `setup.prerequisites` and `setup.required`; `setup.ready` covers runtime
prerequisites, while hook trust and real interaction remain separate checks.

| Observable situation | Action |
| --- | --- |
| Current Codex already runs inside its registered HUD host | Run `start` from this Codex tool environment to reuse/reopen its exact HUD. |
| No registered physical host, including an ordinary existing WT/PowerShell Codex | Explain that this live process cannot be retroactively moved into psmux. Prepare the one-time PowerShell entry setup; do not open a guessed pane. |
| Registered owner is waiting for its first conversation metadata | Leave its independent waiting HUD in place; native SessionStart supplies data. |
| User asks to enable automatic opening | Verify portable psmux, prepare profile changes, arrange native hook review, then enable only as part of the authorized setup. |

One-time setup keeps the user's normal `codex` command. It internally creates an
independent host per interactive invocation in that same PowerShell tab/window.
Preview initialization with `bin/setup.ps1 -Enable` in each PS5/PS7 host in use,
or `setup --profile <absolute-profile-path> --initialize --enable` through Node.
The preview includes both the loader and settings changes. Direct profile-only
setup remains available for explicit maintenance, but is not full initialization.
Writing a real user profile requires the user's authorization for that concrete
change; only then use `--apply`. Do not silently change PATH, WT settings or profiles.
PowerShell 5/7 have separate user profiles; resolve the actual profile from each
shell instead of assuming a Documents path. `host.psmuxPath` selects the verified
portable backend. The compact build requires its packaged checksum manifest;
an arbitrary executable with a matching-looking version is insufficient.
For a machine with older 0.3.4 sessions, keep
`startup.enabled=false`: enabling that legacy flag can revive their unsafe MRU
launcher. Explicitly enable only `host.autoStart` with the value `enabled` for
the authorized 0.4 setup; old runtimes ignore it. Its default `inherit` preserves
existing preferences, and `disabled` explicitly pauses exact-host startup.
Do not treat hook trust alone as setup.

For first-use data binding, direct the user to native Codex `/hooks` to review the
current hook. Never edit trust hashes or add bypass/daemon/security overrides.
Do not start another real Codex or send a model prompt as an implicit self-test.

`start --session <ID>` accepts only the current conversation in its proven host.
An ID or WT window name alone cannot identify a pane. Never use `--window`, WT
last/MRU, focus, titles or the latest log to attach. `once --session <ID>` can
inspect explicitly selected telemetry; it is not proof of a correctly placed HUD.

Menus follow `language` (English by default; Simplified/Traditional Chinese are
supported). Preserve task-name language. Initial HUD height defaults to six rows;
later manual resizing is retained. Compact hosts use Alt+drag on the underlined
last source row; the upstream backend keeps its ordinary divider drag.
Native Codex/statusline
remain intact. Report waiting, rejected or unverified states accurately; only
actual independent displays prove the user's multi-session goal is met.
