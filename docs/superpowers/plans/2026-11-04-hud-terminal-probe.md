# Terminal Detection and Clean Installation Checks

The user requested fixing the remaining Terminal detection failure, reviewing
fresh-environment use, and updating the existing task handoff after delivery.

## Scope and decisions

- Preserve ordinary Codex/psmux startup; it does not require Windows Terminal.
- Keep doctor's terminal boolean for compatibility. Add terminalCheck with
  available/missing/timed-out/failed and only a sanitized error or exit code.
- A demo dry-run generates isolated launch parameters without discovering or
  opening Terminal. A real demo still checks Terminal and distinguishes failures.
- Runtime directories follow an explicitly selected configuration, including
  demo, doctor status/launch lookup and stop. Test children use temporary home,
  configuration and a minimal Windows PATH with no inherited HUD/psmux state.
- Add offline bundled-package checks for PS5/PS7, a native executable fixture,
  and portable Node supplied explicitly while absent from PATH. A fixture is not
  an official Codex session, a new physical machine, or shared-daemon acceptance.
- Normalize Windows namespaced paths in copied-package filters. Node20 supplies
  `\\?\` paths to fs.cpSync filters; comparisons against ordinary source paths
  previously included node_modules/src unintentionally. Assert their absence.
- Allow a bounded filesystem retry only when cleaning test-owned temporary
  executable copies, to handle Windows transient EPERM after process exit. Do
  not retry functional assertions or relax their expected results.
- Real demo preflight must receive the selected config too. A review found this
  omitted branch; an inherited-decoy backend regression failed before the fix.

## Steps

- [x] Reproduce probe misclassification, missing-WT dry-run failure and inherited
  configuration leakage with failing regression tests before production changes.
- [x] Fix runtime/CLI boundaries and run affected tests on Node24 and Node20.
- [x] Validate the clean packaged PS5/PS7 matrix, full suite and existing native
  host regression; obtain a focused review, then release through the formal Git
  source and verify the active installation.
- [ ] Use task-save for the resumed Codex HUD task, preserve replaced handoff
  text in log.md, validate sections/index/zero-loss, and commit only that task's
  documentation and INDEX row. Stop product work after the save.

## Final evidence before release

- Node24 final full npm test: 243/243. Node20.19.0 affected runtime, Terminal,
  setup and distribution checks: 27/27 with one file at a time.
- Clean packaged native-executable fixture plus explicit portable Node and the
  bundled backend initialized both PS5 and PS7 profiles. Neither dev dependencies
  nor source files were in the copied package. Hook trust remains unknown and
  interactive acceptance remains unverified by this synthetic check.
- Final production-backend smoke: 16 checks passed; report
  `C:/Users/mzzhu2/AppData/Local/Temp/hud-production-host-NDH0mV/summary.json`.
- Review found the real-demo inherited-config gap; its new decoy regression was
  observed failing and then passing. Node20 exposed the extended-path copy-filter
  issue and transient EPERM cleanup; final checks include the corrected filter,
  explicit package-contents assertions and bounded temporary-directory cleanup.
