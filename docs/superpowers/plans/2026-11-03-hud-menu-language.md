# HUD Menu Language and Examples Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task with TDD.

**Goal:** Honor the configured menu language and explain options with input/effect examples.

**Architecture:** Keep config validation and English definition metadata stable.
Add a focused menu-help catalogue, then use it in the existing readline menu.

**Tech Stack:** TypeScript, Node 20+, node:test, existing readline interaction harness.

**Spec:** `docs/superpowers/specs/2026-11-03-hud-menu-language-design.md`

## Global Constraints

- Language values remain `en`, `zh-Hans`, `zh-Hant`; English is the default.
- Preserve saved user strings, unknown config fields, Save/Cancel and host settings.
- No new dependency, automatic publication or installed-cache editing.

## Review Focus

- Language changes must affect the next prompt before Save and remain cancellable.
- Every input example must pass existing validation, including nested arrays.
- Chinese text must not change canonical keys, enum values or user content.
- Long Display lists must keep stable option numbers while paging.
- Unavailable options and invalid input must not alter the configuration.

## Task 1: Localized catalogue and menu interaction

**Files:** `codex-hud/src/menu-help.ts`, `codex-hud/src/config-menu.ts`,
`codex-hud/test/menu-help.test.mjs`, `codex-hud/test/menu.test.mjs`.

**Interfaces:** `optionHelp(definition, language)` returns localized label,
example input, effect and unavailable reason; `menuText(language)` returns UI copy.

- [x] Add failing catalogue coverage/valid-example tests and real readline tests
  for Chinese startup, live locale change, Save/Cancel, invalid values and paging.
- [x] Run the focused tests and confirm failures reflect missing behavior.
- [x] Implement the catalogue and localized menu without changing config metadata.
- [x] Build and pass focused tests, then run the full existing suite.

## Task 2: Reviewable menu and documentation

**Files:** `codex-hud/README.md`, generated `codex-hud/dist/`.

- [x] Document the language setting and option examples.
- [x] Open the source menu in a separate interactive WT window for user review.
- [x] Verify generated runtime/package behavior, inspect diff and review the change.
- [x] Report validation and distinguish source preview from formal installation.

Validation: Node 24 full suite 112/112; Node 20.19.0 focused configuration,
menu and package suite 28/28; independent review focused tests 15/15 with no
material findings; `git diff --check` passed. The full-suite unknown-host fixture
now explicitly clears its origin so a real hosted test runner cannot invalidate
that precondition. Formal installed package contents were not changed.

Follow-up requested by the user: hide unavailable/inactive controls, reserve p
for previous-page navigation, use v for preview, keep the section/page open after
edits, and explain first/last-page boundaries. Save/Cancel are available inside
sections. New regressions cover page-two edit followed by p and save, boundary
keys, preview context and hidden-setting preservation. Node 24 full suite:
115/115; Node 20 menu/help suite: 18/18; read-only follow-up review: no material
findings. The updated source menu was reopened for review.
