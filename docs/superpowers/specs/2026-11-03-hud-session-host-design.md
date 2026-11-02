# 每个同时运行的 Codex 都有独立 HUD

日期：2026-11-03。状态：待用户审阅；本文件不是已完成或已部署的声明。

## 1. 已确认的使用方式与验收目标

用户在 Windows Terminal 的多个 PowerShell 标签页中，或分别打开多个 PowerShell 窗口，输入 `codex` 启动会话。两种方式都必须支持。不能要求每次先输入 `psmux`、手动指定会话或挑选 HUD 的目标窗口。

每个同时运行的交互式 Codex 必须自动拥有一个独立 HUD。HUD 的数据和物理位置必须同时对应来源会话；同目录、后台标签页、邻居仍活动、多个窗口均不能改变归属。官方 Codex 和原生 statusline 保留，HUD UI 英文、任务名原语言。关闭 HUD 不结束 Codex，也不关闭其它会话。

“无法确认时停止”是错误保护，不是完成目标的替代品。合成测试通过不代表真实 Codex 或日常使用验收完成。

## 2. 已有证据与根因

- 开发分支 `feat/codex-hud`，已有隔离 worktree；产品当前 0.3.4，本轮基线 `npm test` 为 61/61。
- `src/cli.ts` 的 `start` 与 `src/autostart.ts` 最终调用 `wt.exe -w last split-pane`；会话数据 ID 正确不能证明物理 pane 正确。
- psmux 3.4.0 / 构建 20aa1d7 的隔离原型 22 项通过，包括真实 WT 多标签、原生 split、后台创建、相同 pane ID 跨服务器区分、并发去重。原型使用合成 owner/rollout，不可直接当作正式身份来源。
- 已核对本机当前 `codex` 来自 npm 的官方 `codex.ps1` / `codex.cmd`；未修改这些文件。当前工具进程可通过 Win32_Process 父进程链找到真正的 `codex.exe`，无需读取命令行或对话内容。
- 本机 `startup.enabled=false`；开发与验收期间保持关闭，不能用旧全局 link 执行默认 start。

### 本轮只读可行性核对

当前工具所在 PowerShell 的管理员权限检查为 true；这只是当前进程事实，不推断其它窗口或用户今后的权限选择。官方 0.166.0 的 `tui/src/startup_orchestration.rs:28-35` 与 `tui/src/daemon_startup.rs:1-7` 明确：本地管理员 Windows 启动由官方代码选择进程内服务。因此，当前工具能沿父进程链找到真正的交互 Codex，与这个行为一致；插件无需也不得为此添加 `--no-daemon`。

普通权限窗口可能使用共享服务，不能套用上述结论。已查阅的 `RemoteAppServerConnectArgs`、`thread_start_params_with_reviewer` 和 resume 参数构造没有提供可直接使用的前端 origin 字段；这不足以证明其它传递通道不存在，但足以说明“任意继承 nonce 即可信”没有依据。普通权限下的真实并发与按会话传播验证仍是前置可行性门槛，不能降格为仅返回拒绝就算完成。

## 3. 方案选择

仅让旧 WT 后端拒绝不明目标，不能满足“每个同时运行的 Codex 都有 HUD”；继续用 MRU、焦点、标题、最新日志也不能满足准确归属。要求用户每次手动进入 psmux 或切换到特殊 WT profile，同样不符合这次确认的使用方式。

建议采用：**用户照常输入 `codex`，一次性配置的 PowerShell 入口自动把这一次交互式 Codex 放进独立的 psmux 宿主；HUD hook 再准确绑定这个宿主内的来源 pane。** psmux 是终端层依赖，官方 Codex 仍由官方入口启动，数量与用户发起的启动次数一致。

这是构建者提出的实现方式，不把用户对目标的确认记作已经同意修改 PowerShell profile。正式开发、部署 profile、发布插件、启用本机自动 HUD 是不同阶段；本设计只申请实现方案确认。后续部署前提供实际配置差异，不自动修改用户启动入口。

## 4. 启动入口：保持 `codex` 用法

提供插件拥有的 PowerShell 入口脚本及显式 setup/撤销能力。安装时只向对应 PowerShell 5/7 的用户 profile 增加有边界标记的加载块；保留已有内容。若已存在用户定义的 `codex` function/alias，报告冲突，不擅自替换。

该 function 只负责路由：

1. 普通 `codex`、带交互选项/初始提示的启动、`codex resume` 和 `codex fork` 进入独立宿主；原参数逐项保留。
2. `--help`、`--version`、登录、插件管理、非交互 `exec`、app-server/MCP server 等直接调用原官方命令，不创建 HUD，也不套终端 TUI。
3. 已在本插件管理的宿主中时不重复套一层。嵌套交互启动必须建立不同的来源 pane，不能把两个同时运行的 Codex 强行登记到同一个来源 pane。
4. stdin/stdout 不是交互终端时保持官方 CLI 的管道行为。启动失败明确报告原因，不能悄悄变成没有 HUD 的“成功”。

入口以 argv 调用程序，不拼接用户 shell 命令。需要跨 PowerShell/Node 传参时使用内存中的编码参数，不把提示、命令参数或环境全集写入 launch/绑定/诊断文件。官方 `.ps1` / 原生 `.exe` 从明确解析的原路径调用，不能再次通过 function 名递归调用。

每次用户交互启动建立唯一 psmux namespace/session，在当前标签页或当前 PowerShell 窗口里运行；不使用 `wt -w`，不打开或挑选另一个 WT 标签页。外层 PowerShell在 Codex/宿主结束后恢复原提示符。继承原 CODEX_HOME、工作目录与环境，不设置 approval/sandbox/daemon/profile 覆盖，也不传 ExecutionPolicy bypass。

产品配置可指定经过验证的 psmux 绝对路径。初次交付固定 3.4.0、官方 ZIP SHA256 `a66b6be7c13c6fa0dc3660a267b9e34eaa91a4eb7f07fbd55a0468018bd0f721`。不把旧 Temp 路径、二进制或私有 key 放进源码。开发使用隔离目录和便携包；未获部署授权前不全局安装、不改 PATH 或 WT settings。

## 5. 正式身份校验

新增独立的宿主解析/查询模块，与会话读取和渲染模块分开：

- 会话身份来自原生主 SessionStart 输入及对应 rollout 头部的 `session_meta`；严格排除子代理、非 CLI、compact、ID 矛盾和缺失元数据。工具里手动 start 时必须验证当前 CODEX_THREAD_ID 与目标一致。
- 物理身份包含 psmux 二进制绝对路径、data root、namespace、继承的 TMUX endpoint、服务器 PID+创建时间、session、window、来源 pane、来源 pane 根进程 PID+创建时间。
- 生产 bootstrap 在真实来源 pane 内生成唯一 origin/nonce，并登记实际观察到的 pane 根进程和官方 Codex 前端进程；不是读取测试 fixture 来声称 owner 存在。只通过 Win32_Process 读取 PID、父 PID、进程名、创建时间，不读取或保存命令行、环境全集、凭据。PID 被复用、父子创建时间矛盾、无法访问均停止。
- hook 若确实是对应前端的后代，以父进程链证明真实 `codex.exe` 位于来源 pane 根进程到 hook 的链路上。**不能假设所有 hook 都在前端进程树内**：Codex 的共享 app-server 模式必须保留，不添加 `--no-daemon` 或自定义 daemon 参数。
- hook 若由共享服务执行，只有原生运行时确实按会话传播了该次 bootstrap 的 origin/nonce，且与真实 owner、pane、服务器 incarnation 全部一致，才允许绑定。仅“继承了某个仍存活前端的 token”不够：共享 daemon 可能保留首次启动者的环境。实现前先核对原生 per-session 环境传递链路；真实双前端交叉顺序验收必须证明不会串用。来源不可证明时拒绝创建，不通过改 daemon 模式规避；这一项不通过就不能宣称整个方案完成。
- 所有 psmux 查询和创建都带已校验的服务器/session 作用域与精确 pane；返回值必须再次匹配继承身份。单独 `%1`、单独 thread 或 session 名均不构成绑定。
- 拒绝未支持的共享服务器模式和环境矛盾。初版只承诺已验证的独立服务器模式；不从其它 namespace、活动窗口或邻居中选替代目标。

旧 `buildTerminalArgs` 的真实会话 MRU 路径移除/拒绝；隔离 demo 可保留自行创建专用 WT 窗口。`watch`/`once` 的显式数据读取可保留，但不能冒充独立 HUD 已自动创建。

## 6. 创建、切换、并发与关闭

物理 owner slot 与活动 thread 分开建模：一个同时运行的 Codex 进程有一个 slot，里面只显示当前 thread。不同 Codex 进程，即使 cwd、pane 数字或 resumed thread 相同，也有不同 slot。`clear`/`fork` 在同一个交互进程中切换对话时，准确更新这个 HUD 的数据身份，不能在同一 owner 下堆积旧 HUD。

为避免旧的异步 SessionStart 晚到后把 HUD 切回旧 thread，正式入口将身份确认与绑定作为短的同步 SessionStart 阶段，渲染进程独立运行。该阶段有明确超时，失败不阻止用户使用 Codex；诊断明确 HUD 未就绪，不能宣称目标已满足。改变 hook 定义后仍须用户通过原生 `/hooks` 审阅。

并发锁沿用不可变 PID+nonce claim，并以完整物理 owner slot 为键。发布绑定前重验来源与服务器 incarnation；渲染进程按 launch nonce 回报真实 PID、创建时间与 HUD pane，再核验归属。仅“进程活着”或“heartbeat 新鲜”不能证明是同一显示。

状态至少区分 opening、running、stopping、closed、uncertain。创建前持久化仅含允许元数据的 intent；返回值丢失或 hook 中断时保留 uncertain，不假定 pane 没创建、不盲目重开。只有确认旧 HUD 已退出或来源 incarnation 已终止，才可回收本插件记录。未知/EPERM 不等于已死。

创建使用 `split-window -d -v -t <owner>`，不切焦点、不发送输入。初始尺寸只读取这个来源 pane 的几何，根据实际配置内容计行并预留 Codex 空间，之后保留手动拖动。小到无法容纳时报告确切原因，不在其它 pane 创建。

`q`/Ctrl+C/stop 只停止对应 HUD。Codex 退出后，由已验证的 owner 生命周期信号使本 HUD 退出，避免剩下空宿主；detach 不等于退出。不得 kill-server 或结束任何未经本插件证明拥有的进程。服务端重启、旧 binding、已关闭 pane、PID 复用、清空/恢复 thread 均重新校验。

## 7. 验证与完成门槛

### 自动检查

- 未知来源/矛盾身份/无 psmux 的真实 start 不调用 WT MRU；只读命令和 demo 保持各自用途。
- 真实父进程链验证与伪造/缺失/复用 PID 反例；相同 pane ID 跨服务器不冲突。
- 两个并发 hook 只创建一个 HUD；同 owner 切换 thread 不留旧数据，不把旧 hook 覆盖到新 thread。
- 创建后中断、超时但 pane 已存在、HUD 崩溃、服务端重启、detach/reattach、手动关 HUD 和恢复会话都有明确处理。
- 入口参数含空格、中文、引号、分号、美元符号、反引号和空字符串；PowerShell 5/7；管道与维护命令不被当成交互启动。
- 安装包无 node_modules 运行；profile setup 幂等、保留原内容、冲突拒绝、撤销仅删除本插件块。Node 20+，补 Node 20 检查。

### 真实桌面验收

必须在用户常用的两种方式各运行至少两个真实官方 Codex：同一 WT 多标签，以及多个独立 PowerShell 窗口；另验证 WT 原生分屏不影响邻居。来源在后台、邻居持续活动时，HUD 自动出现在来源内部；数据、pane、PID 和 thread 全部对应。

验证原生 hook 继承和用户审阅后的信任、真实键盘输入/鼠标/滚动/复制、原生 statusline、关闭/恢复互不影响。模型输入由用户操作，不暗中发送模型提示或把合成数据当作真实会话验收。尚在普通 WT 中运行的既有会话不能宣称已被 psmux 接管；需在实际切换后按同一门槛验证。

源码实现、单元测试、合成 smoke、真实 Codex、部署安装分别报告。只有部署后的实际使用证明每个同时运行的 Codex 都有准确独立 HUD，才将目标标记完成。

## 8. 实施与部署边界

继续使用已有 HUD worktree，保留其它任务文件。产品功能实现后按项目规则重新生成并提交 dist，独立审查；日常修改不自动发布。发布/重装必须遵守项目的“推送→刷新正式源→重装→核对”。

本设计确认后可实现源码、入口安装器与隔离验证。用户 profile 修改、固定依赖的实际安装、真实 Codex 的启动/模型输入、插件发布安装和恢复本机自动 HUD，均以具体可审阅结果进行后续部署，不以本设计掩盖尚未完成的阶段。

## 9. 参考与未验证项

- [psmux 固定版本命令与目标规则](https://raw.githubusercontent.com/psmux/psmux/v3.4.0/docs/scripting.md)
- [psmux 固定版本配置](https://raw.githubusercontent.com/psmux/psmux/v3.4.0/docs/configuration.md)
- [共享服务器环境串用问题 #895](https://github.com/psmux/psmux/issues/895)
- [OpenAI 官方 hooks 文档](https://learn.chatgpt.com/docs/hooks)：原生信任仍需用户审阅，transcript 格式不是稳定公共接口。
- 官方固定版本源码：[`startup_orchestration.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/tui/src/startup_orchestration.rs#L28)、[`daemon_startup.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/tui/src/daemon_startup.rs#L1)、[`app_server_session.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/tui/src/app_server_session.rs#L2287)、[`remote.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-client/src/remote.rs#L86)。
- 本任务归档：`E:/Ai_Process_Folder/A_Markdown/Codex_HUD插件开发_20261102/artifacts/psmux-validation-20261103`。

本方案尚未证明真实 Codex 的完整 hook 继承、共享服务的 per-session origin 传递、同步事件顺序、入口参数兼容和 psmux TUI 体验；这些属于实现及验收要解决的问题，而非本设计已经成立的结论。
