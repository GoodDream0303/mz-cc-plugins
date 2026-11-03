# HUD menu language and examples

The user requests configurable Chinese menu text and examples for the options.
The existing `language` setting already supports `en`, `zh-Hans` and `zh-Hant`
and controls HUD rendering, but the configuration menu ignores it.

Use that existing setting for the menu, including navigation, option names,
unavailable reasons, prompts and validation feedback. Default English and saved
user strings remain intact. A language change takes effect in the draft menu
immediately; only Save persists it. Cancel preserves the original file.

Each known option has a localized label, a valid input example and an explanation
of its effect. Canonical keys and enum values remain visible and unchanged.
Unavailable and inactive compatibility options are hidden; their saved values
remain intact. Examples never imply unavailable data is measured.
Long lists show eight options per page with stable option numbers and n/p paging.
Selecting an option shows its example, choices/range and effect before editing.
Editing stays on the same page; n/p navigate after Enter, boundaries explain
why no movement occurs, and v previews without competing with previous-page p.
Save and Cancel work from both the main menu and option lists.
Pressing Enter at a value prompt keeps the current value. Presets explain their
scope, preserve language and unrelated settings, and retain Save/Cancel behavior.

Approach: reuse the existing language setting and validation, with a separate
menu-copy/help catalogue. A second menu-only locale is unnecessary for this
request; changing global definitions to translated labels would break callers
that rely on stable English metadata. No new localization dependency is needed.

Implementation stays in the existing HUD worktree. Do not change hook trust,
host bindings or startup settings. Daily source changes do not automatically
publish or replace the installed package. Provide a source-menu preview for review.

Acceptance: all three languages work; every definition has a valid example and
Chinese labels; switching and cancelling does not write; switching and saving
does; invalid values retain the draft; paging, unavailable fields and legacy
paused startup remain safe; existing regressions continue to pass.
