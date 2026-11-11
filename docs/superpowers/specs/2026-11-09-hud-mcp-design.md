# MCP connection and call areas

## Approved behavior

Implement the second mockup at
`C:/Users/mzzhu2/Pictures/Codex/hud-mcp-tools-mockup-v2.drawio.png`.
The user explicitly selected interface and call visualization first after the
read-only runtime feasibility check found no accessible App Server control socket
for the current standalone CLI. Do not start/reconfigure a daemon or another
Codex. Real connection state remains unknown when no authoritative data exists.

- The connection area stays present when nonofficial MCP servers exist, whether
  or not any tool is currently running. Include server names and connection state.
- `codex_apps` and `codex_tui` are the exact official identities; combine them
  into one Official status without names, tool counts, endpoints, or inventory.
- Configuration is not proof of connection. Enabled servers display Unknown;
  disabled configuration is explicitly labeled as a configuration fact.
- The MCP call area contains active MCP invocations only. No active invocations
  means no call heading, blank line, placeholder, or retained completed MCP rows.
- Each active call displays server/tool identity and elapsed time when known;
  concurrent calls of the same tool remain distinct. Ordinary tools retain their
  Current/Recent sections and existing bounded history.
- Improve ordinary labels from authoritative command-action metadata or a small
  allowlist of command categories. Store only category and safe basename, never
  raw scripts, arguments, result bodies, credentials, or private progress messages.
- Keep active/inactive foreground colors, fonts, NO_COLOR, native selection,
  current configuration, dynamic-height caps and source identity unchanged.
- Respect element ordering. During pagination, keep connection information
  visible when nonofficial MCPs exist, while retaining room for activity and the
  existing warning/pager behavior. Narrow/short panes may paginate overflow.

## Scope and interfaces

Extend `Tool` with optional MCP identity, safe action metadata, start time and
reported duration. Reader correlates real MCP records/call IDs; it does not infer
nested JavaScript execution from source text. Missing timestamps remain missing.
Use a focused presentation helper for connection and active-call rows. No new
runtime dependency or connection polling is included in this scoped revision.

## Acceptance

Verify persistent named connections during idle calls, combined Official unknown
status, configuration-disabled labeling, active-only call rows, separate concurrent
calls, no duplicated MCP tools in ordinary Current/Recent, real timing, safe
command labels, narrow widths, pinned pagination, three languages and no color.
Run full tests and relevant Node20 checks; keep real live-connection integration
explicitly outside the completed scope. No automatic publication/installation.

## Verification

- Reader/presentation fixtures reproduce active-to-idle MCP calls: connection
  names remain and the call heading/rows disappear. Source-only aggregate render
  measurements over 100 fixture frames: median 0.096 ms, p95 0.287 ms; this is not
  an installed-runtime CPU measurement.
- Node24 full suite with the default parallel runner: 269/272 passed; three
  native PowerShell checks timed out (`packaged ASCII profile loader runs from a
  Unicode path without node_modules`, `periodic identity queries keep the actual
  caller and only explicitly requested processes`, `one loaded powershell.exe
  entry follows upgrade after old cache deletion`). No timeout was widened and
  no case was skipped.
- After review fixes, `npm test -- --test-concurrency=1`: 276/276 passed, including
  those three native checks. Node20.19.0 affected suites: 107/107 passed.
- Independent read-only review identified canonical server names containing
  `__` being flattened incorrectly; regression tests observed RED before the
  structured-identity fix. A provisional legacy name is corrected when a
  canonical event arrives, while confirmed history survives tool eviction and
  is cleared when the log is replaced.
- The patch-summary review finding is covered: truncated/multiple-file input
  does not claim a single filename.
- Actual standalone-CLI connection status remains unavailable and is shown as
  Unknown. No daemon, official Codex, hook trust, installed package, live HUD or
  user configuration changes were made. Runtime/interactive acceptance of the
  newly built source remains separate from fixture/full-suite results.
