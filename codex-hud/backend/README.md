# Compact terminal backend

This directory contains the Windows x64 terminal multiplexer used by the HUD.
It changes psmux, not the official Codex executable or model service.

- Base: psmux 3.4.0, commit `20aa1d7254ee93f64dafa059ef89341d9767470a`.
- Opt-in source feature: `hud-compact`; normal source builds retain upstream behavior.
- Build identity: `psmux 3.4.0-hud-compact-v1`.
- Top/bottom panes have zero dedicated separator rows. The upper pane's last row
  keeps its text and colors, with an underline indicating the resize boundary.
- Alt+drag resizes that boundary. Ordinary selection stays separate. Existing
  left/right separator columns remain unchanged.
- Client drawing, mouse coordinates and reported viewport dimensions use the
  same status-bar reservation. Changed compact drag dimensions reach the PTY
  while dragging, rather than waiting for mouse release.

`psmux-compact.json` pins the exact executable checksum and source patch. The
plugin accepts this custom build only when the checksum matches. The executable
has only Windows system-DLL imports; no compiler runtime needs to be installed.
Fresh configurations select this bundled backend. Explicit existing backend
paths remain unchanged and can be migrated through the setup preview.

`LICENSE.psmux.txt` retains the upstream MIT license. The patch in `patches/`
applies to the pinned source commit; `build-recipe.json` records the tested
compiler, locked dependency inputs, source hashes and build commands. End users
do not need Rust. Developers can build the patched source with:

```text
cargo test --locked --features hud-compact --bin psmux hud_compact -- --test-threads=1
cargo build --release --locked --features hud-compact --bin psmux
```

The recorded portable GNU build additionally uses the resource compiler and
native import alias described in the recipe. Those are build inputs, not
runtime dependencies. Do not attach this compact client to an existing upstream
server; the HUD launcher creates an independent namespace and uses the same
verified binary for its server, client and control commands.

Validation scope and current limitations are recorded in
[`../docs/validation.md`](../docs/validation.md). Real Codex hook trust and the
first real session after installation remain user acceptance steps; synthetic
desktop fixtures are not a claim of model-session acceptance.
