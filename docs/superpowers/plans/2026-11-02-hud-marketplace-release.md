# HUD Marketplace Release Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this focused release fix.

**Goal:** Publish an installable Codex HUD 0.3.1 through the existing Git marketplace.

**Architecture:** Keep the current TypeScript modules and native SessionStart hook. Ship generated JavaScript plus the pinned TOML parser and its license, so installation runs no build or dependency download. Preserve the repository's existing marketplace identity and task-handoff entry.

**Tech Stack:** Node.js 20+, TypeScript, smol-toml 1.9.1, native Windows Terminal.

**Constraints:** No trust-file edits, new Codex process, model requests, credential persistence, or changes to unrelated working copies. The missing native hook remains an acceptance issue until checked after installation.

## Release steps

- [x] Add a failing test that copies the installable package without node_modules and executes its CLI and quiet ignored hook.
- [x] Add deterministic runtime packaging and retain the parser license; track dist and bump to 0.3.1.
- [x] Keep marketplace name mz-cc-plugins and list both task-handoff and codex-hud; document Git installation and migration from the development marketplace.
- [x] Run the full suite, test a Git-only export, and inspect the outgoing diff and commit metadata.
- [ ] Commit the release changes and fast-forward the remote main branch; leave user installation and native hook trust to the user.
