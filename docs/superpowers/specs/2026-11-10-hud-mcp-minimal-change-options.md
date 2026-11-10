# Reliable MCP status with minimal Codex changes

Superseded: the user subsequently requested removal of all dedicated HUD MCP features, including the scheduling/call bar. The options below are historical research, not current implementation instructions.

Research only, 2026-11-10. No runtime mode, service, Scope configuration or installed package changed. This is an options analysis, not approval to implement a new topology.

## Goal and scope

Show actual, fresh, current-thread MCP connection state while preserving existing Codex behavior and avoiding regressions in tools such as AI Chat Scope. Keep the distinction between authoritative runtime state and configured names or historical calls. App Server remains an option: the user did not explicitly request its retirement. The separately approved foreground-first startup optimization does not select a new MCP topology.

Three independent investigations covered the exact official runtime, Scope compatibility, and passive telemetry. Findings below target installed Codex 0.167.0 and official `rust-v0.167.0` sources, not a newer main branch.

## Verified findings

1. App Server provides `mcpServerStatus/list(threadId)` and startup status notifications. An observer must attach to the service actually hosting the thread. A different newly started server cannot observe an embedded CLI's memory.
2. Ordinary CLI can use a shared daemon or an embedded App Server. The embedded transport is in-memory; it does not expose an ordinary observer socket. Daemon eligibility depends on launch conditions including elevation, flags, profiles and overrides. The exact exclusion affecting this user's current CLI has not been established.
3. At 20:07:29 Asia/Shanghai, the current default `C:/Users/mzzhu2/.codex/app-server-control` directory and its socket were absent. Read-only `codex app-server daemon version` failed against that socket with os error 10050. This proves no usable default endpoint at that check, not absence of every custom endpoint or permanent lack of daemon support.
4. The installed umbrella `codex app-server` explicitly passes `SessionSource::VSCode`. Its help does not expose `--session-source`; that argument belongs to a separate standalone binary. A remote TUI can therefore legitimately have `source=vscode` and `originator=codex-tui`. This is not evidence that VS Code was opened.
5. `codex app-server proxy` only connects to an existing socket; it does not auto-start a service. It relays raw bytes, not JSONL-to-WebSocket messages. A HUD adapter would still need HTTP Upgrade and WebSocket framing. This may avoid direct Windows AF_UNIX implementation in Node20, but has not been runtime-tested here.
6. Rollout persistence explicitly excludes transient `McpStartupUpdate` and `McpStartupComplete`. Native statusline, hooks, OTel and call history do not provide a verified complete external current-connection snapshot. Parsing additional rollout events cannot supply events that were never persisted.

## Scope compatibility

Scope 2.2.0 accepts a non-`cli` session when its exact SID appears in `live_rows` from the configured endpoint. It supports one loopback WebSocket endpoint and one token-file path per instance, not an endpoint list. Merely correcting `originator` does not correct source-based file discovery.

Consequences:

- Per-host App Servers cannot all be observed by one existing Scope instance without another integration change.
- One shared CLI-only App Server can use Scope's existing supported configuration, without changing Scope code. It changes service isolation/lifecycle and still needs cold-start/reconnect verification.
- Existing tests found the first initialize can determine originator. Scope immediately initializes; its current implementation cannot verify that a CLI has already initialized a restarted service.
- Scope right-click close deliberately rejects an App Server lock writer. Restoring discovery alone does not preserve that capability, even with a per-host server.
- A native default UDS endpoint is not directly compatible with Scope's WebSocket-only configuration. Observing that endpoint in HUD would preserve Codex's existing behavior; it does not itself add Scope discovery for previously unrecognized daemon sessions.

## Options

| Option | Codex changes | Real-time state | Compatibility and feasibility |
|---|---|---|---|
| Observe an already existing native daemon | No launch, source or backend change; add a HUD-only observer transport | Potentially full thread-scoped state | Preferred first candidate. No usable default endpoint exists now. Must prove this physical CLI is attached to that daemon; a matching loaded SID alone is insufficient when another frontend can open the same thread. Windows adapter and identity proof remain unverified. |
| Explicitly select a shared local App Server for CLI, HUD and Scope | Official remote-client path plus service lifecycle and supported Scope configuration | Full snapshot route demonstrated historically | Viable fallback to investigate, not a transparent replacement. Source classification, first initialize, simultaneous sessions, exit isolation and Scope close behavior need explicit acceptance. |
| Return to one service per host | Changes every interactive launch to remote mode | Full snapshot route demonstrated historically | Existing one-endpoint Scope cannot cover all hosts. Do not restore this automatically. |
| Add an upstream supported observer/export for embedded sessions | Requires official implementation/update; no maintained local binary fork proposed | Could provide full state | Longer-term clean route if no external runtime exists. No implementation or availability claim. |
| Passive files/hooks/history only | Small HUD changes | Incomplete; current state remains unknown | Cannot satisfy this task's real-time goal. Unknown is honest interim behavior, not completion. |

## Recommended next investigation

1. Keep current CLI and installed plugins unchanged. First evaluate a HUD-only observer for an already existing official daemon, using the official proxy and an isolated framing fixture. Never start a daemon merely to make detection succeed.
2. Before exposing any status, establish endpoint/process incarnation and this CLI's actual binding, then query the exact already-loaded thread. Do not resume/create a thread, send a turn, infer Connected from history, or reuse another host's state.
3. The current machine lacks the default endpoint, so this route cannot yet be claimed to meet the user's real-session goal. If an authoritative existing endpoint remains unavailable, compare an explicitly selected shared-service deployment against an upstream embedded observer; do not silently choose a backend or rewrite source metadata.
4. Before selecting shared service, demonstrate two simultaneous CLI windows, correct per-thread MCP status, all expected Scope rows, cold starts in both orders, reconnects, and one-window exit without stopping the others. Decide the loss/change of Scope close behavior explicitly.
5. All routes must invalidate states on thread switch, endpoint/process change, disconnection, incomplete pages and expiry. Unknown must remain distinguishable from failed, disabled and authentication-required.

Not proposed: modifying official binaries, rewriting session metadata, broadening Scope to accept every `vscode` session, service-API connection probes, screen scraping, or labeling a successful old call as currently Connected.

## Evidence

- [Official App Server API](https://learn.chatgpt.com/docs/app-server).
- [0.167.0 umbrella source classification](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/cli/src/main.rs#L1229-L1239).
- [Separate standalone source argument](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server/src/main.rs#L44-L51).
- [Embedded in-memory transport](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server/src/in_process.rs#L1-L23).
- [Daemon exclusions](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/tui/src/daemon_startup.rs#L53-L114).
- [Default socket path](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-transport/src/transport/mod.rs#L53-L68).
- [Official raw byte proxy](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/stdio-to-uds/src/lib.rs#L8-L40).
- [Transient rollout exclusions](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/rollout/src/policy.rs#L161).
- [Native statusline fields](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/tui/src/bottom_pane/status_line_setup.rs#L57).
- Local Scope: `ai-chat-scope/src/codex_source.py:282`, `codex_live.py:182,229,239`, `runtime_paths.py:152`, `monitor.py:118`, `codex_close.py:40`, `scope.pyw:780`.
- Prior isolated identity evidence: `docs/superpowers/validation/2026-11-02-codex-signals.md:73`.
