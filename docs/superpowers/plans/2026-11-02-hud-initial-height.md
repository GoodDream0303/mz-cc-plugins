# Content-aware initial HUD height

**Goal:** At attachment time, allocate enough space for the actual configured HUD
content while preserving the upper Codex pane. The user explicitly selected
initial sizing; ongoing resizing and changing terminal products are out of scope.

**Approach:** Read the caller's real console viewport, render the exact selected
session at that width, then convert its wrapped row count to an initial split
fraction. Keep two rows of rounding/padding allowance, cap at terminal.paneSize,
and reserve ten owner rows when feasible. Manual fixed sizing remains available
through terminal.autoHeight=false. Unknown metrics, unavailable telemetry, demos,
and explicit target windows retain the configured fraction rather than guessing.

**Windows measurement:** A packaged PowerShell helper attaches only its own child
process to the nearest exact codex.exe ancestor's console, reads CONOUT$ geometry,
then detaches. It never resizes a window, sends input, or changes user settings.
Interactive manual calls can use their own TTY geometry directly.

**Rendering:** Pack complete fields before wrapping, omit empty activity rows,
show completed-plan text, and put warnings before telemetry. These changes reduce
wasted rows without claiming absent metadata proves no activity. Other audit
findings (agent identity/lifecycle, contrast, help/config navigation) remain
separate findings unless needed for this fix.

## Implementation and verification

- [x] Add failing tests for content-based split sizes, fallback/fixed modes, field
  boundaries, empty rows, completed plans, and visible warnings in short panes.
- [x] Implement the viewport reader and shared initial sizing for hook/manual
  attachment; persist only sizing metadata in the owned launch descriptor.
- [x] Implement field-aware wrapping and concise activity/alert rendering.
- [x] Run the suite, inspect exact console measurements, verify actual Terminal
  pane row counts and independent closure in a synthetic preview with no model.
- [ ] Review the full change, regenerate distributed files, and release/install
  with the established Git marketplace workflow once verification passes.
