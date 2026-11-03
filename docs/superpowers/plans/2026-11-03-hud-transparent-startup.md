# Transparent HUD Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep normal Codex commands usable across plugin upgrades and HUD failures.

**Architecture:** Deploy a self-contained PowerShell loader and small Node resolver outside versioned caches. Resolve the official command and installed plugin on each invocation; restrict fallback to failures before official startup is possible. Reuse existing setup and managed-profile protections.

**Tech Stack:** PowerShell 5/7, Node.js 20+, TypeScript, node:test.

**Spec:** `docs/superpowers/specs/2026-11-03-hud-transparent-startup-design.md` (approved).

## Global Constraints

- Target native Windows x64 with official Codex and Node.js 20+ already available.
- Preserve `codex`, `codex resume <ID>`, literal argv, pipeline input and official exit status.
- Do not change Codex, approvals, daemon options, trust records, global PATH or WT settings.
- Keep six-row defaults and explicit user preferences. Do not publish automatically.
- Use isolated fixtures; do not start another real model session.
- Task scratch output is verification evidence, not persistent user memory; do not create memory or handoff files.

## Review Focus

- Old cache deleted while the same PowerShell function stays loaded: resolve the new installed package on its next call.
- Plugin disabled/uninstalled or listing unavailable: execute official Codex once, never select a leftover directory.
- Quotes, empty arguments and pipeline input on PS5: preserve the existing Node argv transport whenever Node remains available.
- Backend exits after it may have started official Codex: propagate status without launching a duplicate.
- Custom backend versus previous bundled backend: retain the former and rebase the latter to the active package without rewriting saved settings.

### Task 1: Resolve current official and installed plugin entries

**Files:** Create `codex-hud/src/entry-resolver.ts`, `codex-hud/test/entry-resolver.test.mjs`; modify `codex-hud/src/host-launch.ts`.

**Interfaces:** Export `resolveOfficial(command:string):{file:string;prefix:string[]}`, `selectInstalledEntry(list:unknown,hint:string,home:string):string` and a resolver CLI returning a JSON `cli` path. The resolver uses only built-in Node modules so setup can copy its compiled file independently.

- [ ] Write tests for official native/npm resolution, actual installed version overriding residual cache directories, disabled/missing/ambiguous packages, wrong manifest identity and invalid version/path inputs.
- [ ] Build and run `node --test test/entry-resolver.test.mjs`; observe meaningful failures before implementation.
- [ ] Implement bounded official `plugin list --json` lookup without routing through the HUD function. Explicit non-cache source checkouts retain development behavior.
- [ ] Re-run resolver and existing host-launch tests; expect all passing.
- [ ] Commit the resolver change.

### Task 2: Stable PowerShell entry and setup migration

**Files:** Modify `codex-hud/bin/powershell-entry.ps1`, `src/profile-setup.ts`, `src/cli.ts`; create `test/stable-entry.test.mjs`; update affected existing setup/entry tests.

**Interfaces:** Setup returns a stable entry location and copies the PowerShell entry plus standalone resolver there before applying a profile. Existing profile planning/removal API remains usable. Each invocation resolves official/Node/current plugin anew and restores parent environment.

- [ ] Write PS5/PS7 integration fixtures proving one loaded function switches A→B after A deletion; disabled/missing/damaged plugin and unavailable resolver fall back once; official executable path changes are honored; missing bootstrap leaves official command available.
- [ ] Run the new tests and observe failures for the current version-bound entry.
- [ ] Deploy fixed runtime files atomically during authorized setup, retain dry-run behavior and custom config/profile protections, and make profile loading tolerate a deleted bootstrap.
- [ ] Implement per-invocation resolution, exact argv transport and pre-invocation fallback. Never catch an arbitrary nonzero official exit as a fallback request.
- [ ] Run stable-entry, entry-install, host-launch, profile-setup and setup-cli tests; expect all passing.
- [ ] Commit stable entry and initialization migration.

### Task 3: Host preflight fallback and first-use guidance

**Files:** Modify `codex-hud/src/host-launch.ts`, `src/config.ts` or `src/backend-version.ts` as needed, `test/host-launch.test.mjs`, `README.md`, `docs/validation.md`, `skills/hud-start/SKILL.md`, `skills/hud-doctor/SKILL.md`; regenerate affected `dist`.

**Interfaces:** `launchHostedCodex` falls back on preflight errors only; once the backend may execute the owner, its result is propagated. Prior bundled cache paths resolve to the current packaged backend; custom paths stay explicit.

- [ ] Write tests for corrupt settings, missing/rejected backend, old bundled path migration and custom path preservation; assert once-only official execution and original argv/status.
- [ ] Observe RED, implement minimal preflight fallback and path handling, then verify GREEN.
- [ ] Document the single initialization flow, one-time migration/reload, existing Node prerequisite, upgrade behavior and exact fallback boundary.
- [ ] Run `npm test` and `git diff --check`; inspect every failure. Package tests must exclude source/build dependencies and use fake official Codex.
- [ ] Review the complete diff, fix concrete findings and run affected checks; commit implementation and regenerated runtime without publishing or changing live sessions.
