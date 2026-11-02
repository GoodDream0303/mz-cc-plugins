# AI Chat Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 claude-scope 改名为 ai-chat-scope 2.0.0，在同一轻量 Windows 浮窗中监视 Claude Code 与 Codex CLI。

**Architecture:** 两个独立采集器生成统一会话快照，后台轮询器发布最新快照，Tk 只负责展示及明确触发的用户操作。Codex 常规数据只读，专属插件 hook 补充等待信号；先通过真实信号兼容性验证，再实施产品接入。

**Tech Stack:** Python 标准库（tkinter、ctypes、dataclasses、unittest）；Windows；本机验收 Codex CLI 0.166.0 / Python 3.13；不新增第三方运行依赖。

**Spec:** [已批准设计](../specs/2026-11-02-ai-chat-scope-design.md)

## Global Constraints

- 正式名 `AI Chat Scope`，插件/目录 `ai-chat-scope`，版本 `2.0.0`；范围为 Claude Code 与 Codex CLI，不含 Codex 桌面应用。
- 沿用 Python 标准库与 tkinter，不为浮窗引入 Node、Electron、MCP 服务或常驻网络监听器。
- 默认每秒刷新；没有数据变化不重绘；磁盘发现与解析不得阻塞 Tk 主线程。
- 原始 `.claude`、`.codex` 数据只读；不使用 SQLite、不枚举其他进程、不调用 OpenProcess、不用固定超时猜测会话状态。
- hook 不干预授权决定、不写模型上下文、不保存提示词/工具参数/命令/回答/令牌；运行数据仅写本工具自己的目录。
- Claude 原功能保留；首版 Codex 不提供右键关闭，不创建虚构 PID。
- 旧配置只读回退，新配置只写 `%LOCALAPPDATA%\ai-chat-scope\`；不自动安装/卸载/重启用户插件或浮窗。
- 独立 worktree `E:\Ai_Process_Folder\mz-cc-plugins\.worktrees\ai-chat-scope`，分支 `feat/ai-chat-scope`；提交不加 AI 署名，不自动合并/推送或写交接/自动记忆。
- 第一项未通过前不开始第 2–6 项产品实现；发现信号不足时举证并与用户确定降级方式，不能静默改变批准的行为。

## Review Focus

1. 已批准但持续执行的长命令：红灯须在命令结束前恢复绿灯，不能把 PostToolUse 当批准回执（Task 1、4）。
2. 恢复旧会话、机器时间回拨、延迟旧 hook：不能把当前回合错误改红或改黄（Task 3、4）。
3. Codex 锁文件仍在但已释放，或权限拒绝：不能当活跃；目录联接/异常 ID 不能带出数据根（Task 3）。
4. 巨大/损坏的日志、标题索引及 hook stdin：内存和每轮工作量有界，中文跨块不损坏，Tk 仍响应（Task 1、3、5）。
5. 用户同时装新旧插件、另一宿主损坏、旧配置异常：不重复开新浮窗、不破坏旧配置和另一个宿主（Task 2、5、6）。

## 文件与公共接口

文件路径均相对于本 worktree。先保留旧插件做 Task 1，过关后再用 `git mv` 改名。

| 文件 | 职责 |
| --- | --- |
| `tools/codex_scope_probe.py`、`tests/test_codex_scope_probe.py` | 临时验证入口：只记录允许的事件字段，输出状态信号报告，不安装或操纵真实会话 |
| `docs/superpowers/validation/2026-11-02-codex-signals.md` | 兼容性证据、版本、复现步骤和关口结果 |
| `ai-chat-scope/src/session_types.py` | 统一不可变快照与兼容现有 GUI 的行转换 |
| `ai-chat-scope/src/claude_source.py` | 从现有 scope.pyw 提取 Claude 数据读取、过滤、标题与已关闭集合 |
| `ai-chat-scope/src/jsonl_reader.py` | 有预算的增量 JSONL 解析、跨块及文件变化处理 |
| `ai-chat-scope/src/codex_source.py` | Codex 锁/日志发现、来源过滤、常规生命周期与标题 |
| `ai-chat-scope/src/win32_support.py` | 只读文件锁探测与本应用的单实例命名 mutex，不操作其他进程 |
| `ai-chat-scope/src/runtime_paths.py` | 新运行目录、Codex home 隔离键、配置兼容与原子发布 |
| `ai-chat-scope/src/codex_hooks.py`、`codex_wait.py` | 被动 hook 输入处理及经 Task 1 验证的等待归并逻辑 |
| `ai-chat-scope/src/monitor.py` | 后台采集、宿主故障隔离、容量 1 的最新快照队列 |
| `ai-chat-scope/src/scope.pyw` | 沿用现有 GUI、Claude 关闭子进程、增加来源和能力感知 |
| `ai-chat-scope/scripts/start_scope.py` | 两端共用的无窗口启动入口 |
| `ai-chat-scope/tests/test_*.py` | 标准库 unittest；临时目录生成数据，不复制真实对话 |
| 两端插件清单、市场清单、专属 hook 配置、启动技能及 README | 同一源码的双宿主分发与人工验收步骤 |

`SessionSnapshot` 为 frozen dataclass：`provider: str`（`claude`/`codex`）、`session_id: str`、`cwd: str`、`title: str`、`state: str`（`run`/`stby`/`attn`/`bg`）、`state_detail: str`、`started_at: float`（UTC 秒）、`freshness: str`（`fresh`/`syncing`/`stale`）、`capabilities: tuple`、`pid: Optional[int] = None`、`kind: Optional[str] = None`、`job_id: Optional[str] = None`、`bg_info: Optional[dict] = None`。`key` 返回 `(provider, session_id)`。

`to_gui_row(snapshot) -> dict` 提供现有绘图所需 `id/pid/label/state/bg_info/kind/job_id` 以及 provider/detail/freshness/capabilities；新 PID 缺省值不得变成 0。采集器 `poll() -> list[SessionSnapshot]`；有界诊断以不含会话正文的 `diagnostics: tuple[str, ...]` 提供。下游不直接读取源文件。

## Task 1：验证等待信号的完整生命周期

**Files:** Create `tools/codex_scope_probe.py`, `tests/test_codex_scope_probe.py`, `docs/superpowers/validation/2026-11-02-codex-signals.md`。

**Interfaces:** `sanitize_hook(payload: dict, observed_ns: int) -> dict`；`summarize_records(records: list[dict]) -> dict`。只保留设计允许的元数据、字段名和时间；报告不得保留真实正文。产品 hook 的最终事件选择必须来自本项结论。

- [x] 写失败测试 `test_probe_drops_prompt_arguments_and_response`、`test_probe_rejects_oversized_input`、`test_report_does_not_treat_tool_completion_as_approval`：输入包含 `prompt/tool_input/last_assistant_message` 与标记秘密的 JSON，序列化结果中均不出现；上限 1 MiB；只有 PermissionRequest+工具完成时，报告必须为 `approval_resume_proven == False`。
- [x] 运行 `python -B -m unittest discover -s tests -p test_codex_scope_probe.py -v`，确认测试因缺少探测模块失败。
- [x] 实现有界、只存白名单的探测器；`--prepare <临时工作目录>` 仅生成该目录下的项目 hook 测试配置，`--hook` 采集到同一测试目录，`--report` 输出字段/事件时间线。不修改用户全局配置、不自动启动模型请求、不替用户操作授权。需要查看 CLI 对应源实现时使用官方资料或已安装本机程序，并在证据中注明版本。
- [x] 重跑上述测试通过；用独立临时文件验证半行和超过 1 MiB 输入不会泄露正文或崩溃。
- [ ] 提供隔离测试入口，让用户在明确的测试 CLI 中完成：批准后执行数秒命令、拒绝授权、取消/中断、同步提问、异步提问、并发工具及会话正常退出。实时观察实际事件，不把手工捏造样本当作 CLI 证据；正常结束测试会话，不批量终止其他会话。
- [ ] 写证据报告：每种情景的可用信号、因果关联字段、出现时间、解除等待的证据、失败/不支持情景。若不能证明批准后的及时恢复，停在本项，向用户报告具体缺口并确定降级后再修订计划；不能将以下产品项标为完成。
- [ ] 过关时固化脱敏事件形状为测试样本，提交探测器、测试及证据：`test(scope): verify Codex lifecycle signal contract`。临时 hook 仅在核对绝对路径仍位于本次测试根后清理；不操作用户原始日志。

## Task 2：改名并保留 Claude 行为

**Files:** Rename `claude-scope/` → `ai-chat-scope/`；create `src/session_types.py`, `src/claude_source.py`, `tests/test_claude_source.py`, `tests/test_session_types.py`；modify `src/scope.pyw`。下述 `src/` 和 `tests/` 均位于新插件根。

**Interfaces:** `ClaudeSource(home: Path).poll() -> list[SessionSnapshot]`，`mark_closed(pid: int, session_id: str) -> None`；`SessionSnapshot.key`、`to_gui_row()` 如公共接口定义。

- [ ] 先执行 `git mv claude-scope ai-chat-scope`，核对内容未改变，以免预先创建测试目录导致目录移动失败；这一步只改路径。
- [ ] 写失败测试：`test_parked_hides_only_when_live_bg_present` 覆盖 spare/parked 的四种组合；`test_waiting_overrides_background`、`test_explicit_title_beats_ai_title`、`test_partial_session_keeps_previous_snapshot`；`test_cross_provider_same_id_has_distinct_key`、`test_codex_has_no_fake_pid_or_close_capability`。所有数据在临时目录生成。
- [ ] 运行 `python -B -m unittest discover -s ai-chat-scope/tests -p 'test_*.py' -v`，确认新接口测试因缺少实现失败。
- [ ] 提取现有 Claude 读取逻辑，保留现有已验证的标题、后台、去重和关闭集合语义；让 scope.pyw 暂时通过 `to_gui_row()` 使用 ClaudeSource。只对有效 Claude PID 提供 `close` 能力；其他 GUI 行为此时保持原样。
- [ ] 重跑插件测试，核对 `git diff --find-renames`，确认是移动/提取而非维护第二份 UI，旧源码目录不再保留重复产品代码。
- [ ] 提交：`refactor(scope): rename monitor and isolate Claude session source`。

## Task 3：Codex 活跃会话与常规状态采集

**Files:** Create `src/jsonl_reader.py`, `src/codex_source.py`, `src/win32_support.py`, `tests/test_jsonl_reader.py`, `tests/test_codex_source.py`, `tests/test_win32_support.py`。

**Interfaces:** `probe_writer_lock(path: Path) -> str` 返回 `held/released/unavailable`；`JsonlReader(path: Path, max_line_bytes: int = 2097152).read(max_bytes: int = 262144) -> list[dict]`，属性 `caught_up: bool`；`CodexSource(home: Path, lock_probe: Callable = probe_writer_lock).poll() -> list[SessionSnapshot]`，`diagnostics`；路径发现每次最多处理 256 项，完整刷新间隔 10 秒，未知新锁可触发有预算的路径补查。

- [ ] 写失败测试：`test_released_lock_is_not_live`、`test_access_denied_is_not_held`、`test_filters_subagent_and_non_cli`、`test_active_lock_with_missing_log_is_reported`、`test_session_index_name_updates_incrementally`；JSONL 覆盖 UTF-8 分块/半行、超长行后恢复、截断、同路径替换、同长度改写、每次读取不超预算；含符号链接/目录联接的源路径不得越出规范化数据根。
- [ ] 运行插件 unittest，确认新模块相关测试失败。
- [ ] 实现只读 Win32 字节读取探测，只有错误 33 属于 held；不使用 LockFileEx 或 OpenProcess。测试中另起自己的短期辅助进程，在临时文件上持有/释放锁，验证两态且目录内容未被探测函数改变。
- [ ] 实现有界发现、元数据来源确认、增量标题索引及生命周期状态。未追赶完为 syncing；单个文件异常保留上一份有效快照并标 stale，不用历史记录填充列表；缺少能力时报告数据源不可用。旧回合完成不得覆盖新回合开始。
- [ ] 重跑插件 unittest；在实际 Codex 数据根做一次只读列表核对，输出 ID/状态与源诊断，不输出对话正文、不创建源目录附属文件。真实退出行为的验收关联 Task 1 证据。
- [ ] 提交：`feat(scope): read active Codex CLI sessions incrementally`。

## Task 4：被动 hook 与等待状态归并

**Files:** Create `src/runtime_paths.py`, `src/codex_hooks.py`, `src/codex_wait.py`, `tests/test_codex_hooks.py`, `tests/test_codex_wait.py`, `tests/test_runtime_paths.py`。

**Interfaces:** `runtime_root() -> Path`；`codex_home_key(home: Path) -> str`；`publish_event(root: Path, event: dict) -> Path`；`hook_main(stdin, stdout, root: Path) -> int`；`WaitReducer.apply(event: dict) -> None`，`resolve(session: SessionSnapshot) -> SessionSnapshot`。事件白名单及恢复转换以 Task 1 固化的兼容契约为准，不额外推断不存在的回执。

- [ ] 写失败测试：白名单脱敏和 1 MiB stdin 上限；异常输入/不可写目录仍返回 0 且输出 `{}`；并发事件分别原子发布、读不到半 JSON；非法 session ID/路径穿越/重解析目录被拒绝；规范化相同 home 的键相同、不同 home 隔离。
- [ ] 写失败测试：Task 1 的真实脱敏序列准确重现红→绿/黄；批准后的长工具仍执行时为绿；拒绝/中断/下一回合清理旧等待；并发等待不串线，旧回合延迟事件不能重新置红，异步提问不能因工具立即返回而误清，墙钟回拨不改变已确认的因果顺序。
- [ ] 运行插件 unittest，确认失败；实现事件发布、归并及源能力提示。使用单调时间与回合/调用归属处理乱序，不能只按墙钟排序；事件文件清理由工具自己负责，保留当前未收敛状态，已退出会话才清理其已归并文件，删除前核对绝对路径属于本工具运行根。
- [ ] 将 WaitReducer 接入 CodexSource 的快照汇总；未收到可确认的 hook 注册/事件时，明确显示等待状态未确认。根据验证结果添加最小必要注册事件，不为每个普通工具启动 Python；不得修改 CLI 全局文件或自动取得 hook 信任。
- [ ] 重跑插件 unittest，核对输出目录中不存在样本秘密文本，故障路径不会把原始 stdin 写入 error.log。
- [ ] 提交：`feat(scope): observe Codex wait states with isolated plugin hooks`。

## Task 5：统一浮窗、后台快照与配置兼容

**Files:** Create `src/monitor.py`, `tests/test_monitor.py`, `tests/test_scope_ui.py`, `tests/test_config.py`；modify `src/scope.pyw`, `src/runtime_paths.py`, `src/win32_support.py`。

**Interfaces:** `Monitor(sources: list).start() -> None`、`latest() -> Optional[tuple]`、`stop() -> None`，最新消息为 `(sessions, diagnostics)`；`load_window_config(new_path: Path, legacy_path: Path) -> dict`；`save_window_config(path: Path, config: dict) -> None`；`claim_single_instance() -> Optional[object]`（返回句柄持有器，重复时 None）。

- [ ] 写失败测试：一端抛错另一端继续更新，队列只保留最新快照；慢源等待时 UI latest 调用立即返回；名称/能力/诊断更新都触发重绘，单纯轮询不触发；状态变化保持稳定行序，同标题短 ID 消歧。
- [ ] 写失败测试：Codex 行没有关闭项且不能从回调绕过；Claude 关闭仍采用既有 stop/quit/taskkill 确认链；新配置优先、旧配置只读回退、坏配置/NaN/越界数值有安全默认；重复启动不创建第二个窗口，不枚举其他进程。UI 行为用 Tk stub/纯菜单构造测试，真实 Windows 点测补充，不把测试写成源码字符串匹配。
- [ ] 运行插件 unittest，确认失败；实现后台 worker 与非阻塞快照读取，仅 Tk 线程操作控件；设置停止事件，不在 UI 关闭时等待无界 I/O。源故障作为简短状态提示显示，不把“不可用”当“没有会话”。
- [ ] 将标题改为 AI Chat Scope，增加 CC/CX 来源标记及各行状态说明；保留拖动、置顶、透明度/缩放与原始 Claude 关闭行为。新配置原子保存，只写新路径；单实例使用用户范围命名 mutex，不检查其他进程 PID。重复启动退出或聚焦本应用窗口，不操作别的窗口。
- [ ] 重跑插件 unittest，并用独立测试入口点测 GUI 与混合 fixture；不关闭或重启用户当前浮窗。记录拖动/缩放响应及每轮读取开销，不引用旧内存数字作为保证。
- [ ] 提交：`feat(scope): display both providers with responsive polling`。

## Task 6：双宿主打包、文档及验收

**Files:** Modify `ai-chat-scope/.claude-plugin/plugin.json`, `ai-chat-scope/skills/scope-show/SKILL.md`, `ai-chat-scope/README.md`, `ai-chat-scope/src/README.md`, `ai-chat-scope/src/start.vbs`, `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`；create `ai-chat-scope/.codex-plugin/plugin.json`, `ai-chat-scope/hooks/codex-hooks.json`, `ai-chat-scope/scripts/start_scope.py`, `ai-chat-scope/tests/test_packaging.py`, `ai-chat-scope/tests/test_launcher.py`。

**Interfaces:** `start_scope(plugin_root: Path) -> int` 无窗口启动本工具，返回 0 表示启动请求成功，不代表真实 GUI 验收通过；启动路径基于入口文件位置，不能依赖当前目录或用户名。

- [ ] 写失败测试：两端 name/version 一致为 ai-chat-scope/2.0.0、资源路径存在；Codex 清单显式引用专属 hook 配置，默认 hooks/hooks.json 不存在，Claude 清单不引用 Codex hook；两市场保留其他插件条目；启动脚本在含空格/中文/引号的路径下按参数数组运行，不经字符串 shell 拼接；VBS 不含个人 Python 绝对路径。
- [ ] 运行插件 unittest，确认失败；填写清单与市场条目，共用宿主中性的启动技能；Codex 使用其支持的插件根变量，Windows 命令正确引用。启动器使用当前 Python 对应的 pythonw 或标准无窗口回退；不把 Claude Bash 内联语法当作 Codex 执行约定。
- [ ] 更新 README：依赖、两端安装/手动启动、hook 信任、旧插件手动迁移与旧配置兼容、Codex 不支持关闭、已验证版本和能力降级；清楚区分旧会话未加载 hook 与工具故障。不安装或卸载用户现有插件。
- [ ] 运行 `python -B -m unittest discover -s tests -p test_codex_scope_probe.py -v`、`python -B -m unittest discover -s ai-chat-scope/tests -p 'test_*.py' -v`、所有产品 Python 文件 AST 解析、清单 JSON 解析、`git diff --check`；全部应通过。只在改动影响其他插件时运行相应检查，不无故安装其他插件依赖。
- [ ] 进行隔离的真实双宿主 GUI 验收：活跃发现、执行/待机、两端等待与恢复、Codex 正常退出后消失、hook 未启用时提示、来源与同名消歧、窗口操作与重启。需要用户手动信任 hook/操作真实测试对话的项目保留为明确验收项，不能凭模拟测试标通过。
- [ ] 使用 requesting-code-review 完整审阅本分支；按证据处理反馈，修复后仅重跑受影响检查。交付包含测试计数、真实验收结果、限制与提交列表；使用 finishing-a-development-branch 收尾，不擅自合并/推送。
- [ ] 提交：`feat(scope): package AI Chat Scope for Claude and Codex`。

## 计划自查

- 设计 §1–3 的范围/约束：Global Constraints 与 Task 1 关口；§4 数据与接口：Task 2–3；§5 hook：Task 1、4；§6 UI/配置/关闭：Task 5；§7 分发：Task 6；§8–10 验收/风险/依据：各测试与证据报告。
- Review Focus 五项均分配了行为测试，不依赖源码文本匹配；公共类型与下游函数名一致。
- Task 1 信号尚未证实，后续任务明确依赖其契约，不把探索结论写成已实现能力；需要降级时必须带证据回到用户。
- 用户已确认 native 执行：本会话由主代理实施、完成后独立审阅。当前停留在 Task 1 真实场景验证，Task 2–6 尚未开始。
