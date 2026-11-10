# HUD Live MCP Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在可选本机 App Server 模式中显示当前线程的权威 MCP 连接状态，调用栏保持原样。

**Architecture:** 现有 psmux owner 启动独立的官方 App Server 与直接连接它的官方 TUI；记录并核对两者实际进程来源。HUD 使用第二个只读 WebSocket 连接、按明确 threadId 轮询 runtimeStatus，状态失效时恢复 Unknown。

**Tech Stack:** TypeScript、Node20+、Node test runner、ws 8.22.2（固定并离线携带）、@types/ws 8.18.2。

**Spec:** `docs/superpowers/specs/2026-11-10-hud-live-mcp-design.md`

## Global Constraints

- 仅新增连接状态；调用栏、普通工具、颜色、原生选择及高度逻辑保持原有行为。
- `host.runtime` 为 `cli` 或 `localAppServer`，默认 `cli`；不修改实际用户配置、profile、trust、PATH 或 daemon。
- 每 host 独立本机实例；令牌至少 256 bit，不落盘、不进入命令行。
- 只读方法仅 initialize、initialized、thread/loaded/list、mcpServerStatus/list；不得为状态查询启动/恢复线程或发起模型回合。
- 轮询每 5000ms，单请求超时 2000ms，12000ms 失效，上限 64 个服务；分页失败不可输出完整清单结论。
- 全量验证使用 `npm test -- --test-concurrency=1`；Node20 验证相关套件和离线包。
- 沿用现有隔离 worktree；已有 __pycache__ 保留。用户已授权实施，采用本会话直接执行，不再次要求批准实施计划。

## Review Focus

- 验证分页游标循环、清单中途失败及缺失 runtimeStatus，不能保留旧 connected。
- thread 切换、尚未 loaded、断开或进程实例变化时，旧连接状态不得流入新会话。
- 新来源分支只接受登记的本机 App Server ancestry，旧 CLI 及子代理拒绝规则继续生效。
- 本机服务准备失败可在 TUI 尚未启动前回退，已启动/不确定时不得二次启动 Codex。
- 离线包在没有 node_modules、可选原生扩展与 Node24 WebSocket 时仍能执行 Node20 查询。

---

### Task 1: Read-only MCP status and presentation

**Files:** Create `codex-hud/src/mcp-runtime.ts`, `codex-hud/test/mcp-runtime.test.mjs`; modify `src/types.ts`, `src/mcp-display.ts`, `src/config.ts`, `scripts/package-runtime.mjs`, package/lock, `test/mcp-display.test.mjs`, `test/package.test.mjs`.

**Interfaces:**
- `McpRuntimeSnapshot {sessionId:string;checkedAt:number;complete:boolean;servers:{name:string;status:McpConnectionStatus}[]}` on `HudSnapshot.mcpRuntime?`.
- `McpRuntimeClient(endpoint:string,token:string)`, `read(sessionId:string):Promise<McpRuntimeSnapshot>`, `close():void`.
- `McpRuntimePoller` owns async nonoverlapping 5-second reads and returns only current-session, unexpired status; constructor consumes client `read/close`, `refresh(sessionId,now?)`, `snapshot(sessionId,now?)`, `close()`.

- [x] Write failing tests: real loopback WebSocket fixture observes only permitted methods and exact threadId; only server name/status retained; pagination, repeated cursors, unknown states, not-loaded thread, timeout/oversize/disconnect; poller drops switched/stale/incomplete data. Presentation uses runtime status only for matching session, returns Unknown for missing/expired facts, localizes all states and official Mixed; existing call tests unchanged.
- [x] Run `node --test --test-concurrency=1 test/mcp-runtime.test.mjs test/mcp-display.test.mjs`; observe missing-feature failures before implementation.
- [x] Add fixed ws/client typing, vendoring and license. Implement bounded requests with no redirects/compression, loopback endpoint validation and at most 64 servers, pagination, safe projection, freshness and localization; add validated default-off config choice.
- [x] Run build and affected tests including config/package/render; expect all pass, offline ws import works.
- [x] Commit only Task 1 files and generated dist.

### Task 2: Local service lifecycle and source proof

**Files:** Create `codex-hud/src/local-app-server.ts`, `codex-hud/bin/listener-facts.ps1`, `codex-hud/test/local-app-server.test.mjs`; modify `src/host-launch.ts`, `src/psmux.ts`, `src/host-session.ts`, related host/proof/autostart tests.

**Interfaces:**
- `LocalAppServerProof {endpoint:string;process:ProcessFact}` extends `HostProof.appServer?`.
- `startLocalAppServer(invocation:CodexInvocation,token:string):Promise<{proof:LocalAppServerProof;stop():Promise<void>}>`; resolves official native/npm entry to the actual native executable and proves its loopback listener.
- `registerLocalAppServer(proof:LocalAppServerProof):void` records only under verified owner.
- `readLoopbackListener(port:number):number` returns sole 127.0.0.1 listening PID with native PS helper; no commandline or credentials.

- [x] Write failing tests for source ancestry (registered server vs foreign/reused/dead process, sibling frontend, legacy rejection), default-off routing, remote argv and token privacy, startup cleanup/exit behavior. Native service test uses an isolated CODEX_HOME and local fixture only, no model or real user TUI.
- [x] Run selected host/local-server suites; observe missing-source/runtime failures.
- [x] Generate token only in local mode before psmux host creation, start/prove/register official service before HUD/TUI, pass native remote arguments without changing user argv, extend exact-process proof and explicit identity queries. Keep legacy path unchanged; cleanup only proven local children.
- [x] Run host-launch/host-session/autostart/psmux and local-server tests serially; expect all pass.
- [x] Commit only Task 2 files and generated dist.

Implementation ruling: npm service startup resolves its official native executable so a single owned process handle controls lifetime; no separate launcher fact is needed. Supported config overrides and cwd reach the service; named profiles, local-provider startup and explicit --no-daemon fall back to the ordinary CLI before any TUI starts.

### Task 3: Viewer integration, offline checks and final review

**Files:** Modify `src/cli.ts`, `src/menu-help.ts` as needed, `README.md`, config/renderer integration tests and package tests; add `test/mcp-live-integration.test.mjs` if it carries nonfixture native coverage.

**Interfaces:** Viewer consumes verified `record.proof.appServer`, inherited token and explicitly bound session ID; owner/viewer checks retain actual birth times. `McpRuntimePoller` supplies `snapshot.mcpRuntime` only after host proof succeeds.

- [x] Write failing integration tests for valid display and stale/foreign/closed-host fallback; offline Node20 package imports and reads test runtime without node_modules; call-area regression remains unchanged.
- [x] Observe failures, then integrate nonblocking polling and resource cleanup into watch; verify host/server/frontend identity before starting each refresh, clear on config/session/host changes. Reuse existing 5-second identity checks where safe.
- [x] Document opt-in next-start behavior, unchanged call-area scope, experimental transport and exact manual acceptance for actual CLI source, SessionStart, resume/clear and real user MCP. Do not auto-enable, publish, install or claim those manual checks passed.
- [x] Run serial full suite, affected Node20 suites and isolated official App Server plus local test MCP. Inspect results and product/user config diff. Expect zero relevant automated failures and no residual test processes.
- [x] Commit completed implementation and verified results; request one fresh whole-branch review; fix material findings with RED→GREEN and rerun affected checks. Keep unrelated files untouched.
