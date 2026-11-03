# AI Chat Scope Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make first setup and launch from a marketplace installation work with clear environment diagnostics.

**Architecture:** A shared Windows PowerShell bootstrap resolves Python without requiring the python alias. A Python environment checker initializes only missing configuration and is reused by the launcher. Provider paths honor host environment variables.

**Tech Stack:** Windows PowerShell 5+, Python 3.9+, tkinter, unittest; no new packages.

**Spec:** ../specs/2026-11-03-ai-chat-scope-setup-design.md

## Global Constraints

- Preserve existing configuration, source session data and unrelated worktree changes.
- No dependency installation, hook trust changes, service startup or release as part of development.
- Runtime writes stay outside the plugin directory. Never store token contents.

## Review Focus

- Python alias absent: py -3 must work for setup, launch and Windows hooks.
- Tk import succeeds but GUI initialization fails: report the actual missing GUI support.
- Existing damaged configuration: report without overwriting it.
- Quoted/Unicode plugin paths: argument boundaries survive native shells.
- Single installed CLI or no sessions yet: report source availability without blocking setup.

### Task 1: Environment checks and data roots

**Files:** create ai-chat-scope/src/setup_environment.py and tests/test_setup.py; modify src/claude_source.py, src/runtime_paths.py, src/scope.pyw and tests/test_claude_source.py.

**Interfaces:** prepare_environment(plugin_root, initialize=False) returns a report with runtime/config/source paths and messages, or raises SetupError. claude_home() resolves CLAUDE_CONFIG_DIR with the current default as fallback.

- [x] Add and run failing tests for first setup, idempotence, legacy migration, bad config, Tk failure, unwritable runtime and custom Claude home.
- [x] Implement shared path resolution and setup checks without changing existing configuration.
- [x] Run the focused tests; expected all pass.

### Task 2: Portable Windows entry and launch errors

**Files:** create scripts/scope.ps1; modify scripts/start_scope.py, hooks/codex-hooks.json, tests/test_launcher.py, tests/test_packaging.py and tests/test_setup.py.

**Interfaces:** scope.ps1 [-Setup|-Check|-Hook] forwards optional Codex endpoint/token-file paths; --setup initializes and exits, --check checks without creating config, default launches after initialization. Windows hooks use -Hook and remain passive.

- [x] Add and run failing subprocess tests for py-only PATH, missing Tk, correct exit status and quoted paths.
- [x] Implement Python discovery, setup/check CLI modes and early stderr logging.
- [x] Verify all shell packaging tests and focused startup tests pass.

### Task 3: Packaged onboarding and final validation

**Files:** create skills/setup/SKILL.md; update skills/scope-show/SKILL.md, README.md and packaging tests.

**Interfaces:** both hosts expose setup; scope-show uses the packaged bootstrap. Setup explains optional realtime and hook trust without granting either.

- [x] Verify baseline setup instructions are missing; add the focused setup skill and update launch instructions.
- [x] Validate skill metadata and resources; run 78+ product tests and 22 probe tests with new regressions.
- [x] Run an isolated installed-package setup/launch scenario, inspect the full diff and perform an independent final review.
- [x] Leave the change reviewable without pushing, publishing or altering installed caches.
