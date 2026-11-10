# 本机 App Server 模式与真实 MCP 状态

状态：2026-11-10 用户已批准实施；发布安装另行授权。

## 目标与已选路线

用户要求先验收当前会话绑定、代理显示、真实 MCP 调用显示，再接入当前会话的真实 MCP 连接状态。
用户选择「增加可选本机 App Server 模式」，并明确授权先做临时可行性验证；随后明确收窄为「状态栏显示状态即可」，调用栏保留原有逻辑。

考虑的路线：

1. 插件管理每个物理 host 独立的本机 App Server：能准备当前机器缺少的接口，需扩展启动和来源校验。用户选择此路线。
2. 只连接用户提供的现有端点：启动改动较少，但当前机器没有可用端点，无法完成本机目标。

本设计使用官方 TUI 直接连接本机 App Server，HUD 通过第二个只读连接查询状态。不增加前端转发器，不接入或修改调用事件流。独立客户端通知范围的差异不影响本次连接状态查询。

## 本次验收与可行性证据

- 当前独立 CLI 为 0.167.0；Node 为 24.15.0；HUD 为正式安装 0.7.8。
- 已验证实际来源 ancestry、出生时间、物理 pane、当前 thread/transcript 一致；host 为 `19d51b79-77d7-419d-9603-51f6237381bd`，source `%1`，HUD `%2`。
- 实际 HUD 窗格捕获到了 `hud_acceptance_probe` 的亮色 running 和灰色 done，随后结束行在约 60 秒后收起。该证据覆盖这一个真实代理，不扩大为全部多窗口交互通过。
- 当前 transcript 的 MCP 调用记录只在完成后落盘，没有对应实时开始记录。实际执行官方搜索 MCP 并采样 HUD，没有捕获活动调用行；第三项验收尚未通过。
- 当前会话没有 App Server 控制目录或 socket。本次没有启动 daemon、修改信任、配置、profile、PATH 或重启当前 Codex。
- 隔离临时 CODEX_HOME 下，官方 App Server 的 Windows loopback WebSocket、随机令牌认证、两个独立客户端 initialize 和 MCP 状态查询均通过。
- 第二次临时验证创建一个 ephemeral 测试线程；另一个客户端从同一服务的 loaded 列表确认该 ID，并通过带 threadId 的 `mcpServerStatus/list` 得到本机测试 MCP 的 `runtimeStatus=connected`，延时工具调用正常。没有发送 `turn/start` 或模型请求。
- 测试线程来源是 `vscode`，并非真实 CLI。它仅验证协议，不支持放宽生产来源校验。正式 TUI 的来源、SessionStart、clear/resume 与最终交互仍待真实验收。
- 独立观察连接能看到 thread/started，但没有收到创建客户端的 MCP startup 通知。直接 `mcpServer/tool/call` 不等同模型回合工具执行，不能据此声称真实 item/started 调用展示通过。
- 两个临时 App Server 均已退出，检查无对应存活进程或本机测试 MCP 残留。临时目录只含隔离测试数据，未复制用户认证。
- 正式用户配置 SHA256 仍为 `04A881060681319D3099C8B01A91F94FF59CD5810CC8F1F2A72D1F96A4170655`；产品工作区没有本次代码改动。

官方协议参考：<https://learn.chatgpt.com/docs/app-server>。本机 0.167.0 生成的 schema 在临时目录 `hud-live-mcp-schema-20261110`，以该版本字段为实现基线；WebSocket 属于官方实验性传输。

## 行为与范围

- 建议增加 `host.runtime`，值为 `cli` 或 `localAppServer`，默认 `cli`。仅显式启用后采用新模式；当前普通 codex/codex resume 路径保持可用。
- 配置入口复用现有配置与稳定 loader；不要求重写 PowerShell profile 或安装用户依赖。实际用户配置变更在展示具体差异后执行。
- 新模式中，每个物理 host 启动一个独立的官方本机 App Server，再启动连接该实例的官方 TUI；不使用或重配系统共享 daemon。
- 不接管当前运行的会话。用户下次正常结束后，可在启用新模式的入口手动恢复原会话；实施与测试阶段不隐式启动另一个真实用户会话或发送模型请求。
- 新模式来源或连接无法验证时显示 Unknown/明确诊断；不能拿独立服务新建连接的结果冒充当前对话状态。
- MCP 连接区保留官方合并显示、第三方名称、禁用配置标注和现有布局约定。活动调用区保留 server/tool、已知耗时及结束后收起。
- 用户实施期间补充：MCP 连接状态合并为一条逻辑行，只有终端宽度放不下时才换行；仍保留必要的窄窗分页与关键告警处理。
- 不恢复普通工具参数对象，不修改现有颜色/字重、原生选区、剪贴板、分页和高度限制。

## 启动与生命周期

- source owner 管理官方服务和真实 TUI 的生命周期；每个 host 独立实例、端口和随机令牌，不共享其它 host 的连接。
- 服务只监听 127.0.0.1 的动态端口。令牌至少 256 bit，在创建本 host 前生成，仅通过该 host 的子进程环境传给 source owner、TUI 和 viewer；服务器只接收验证哈希。不把原始令牌写入文件、日志、命令行、descriptor 或父 PowerShell 的持久环境。
- 官方 TUI 使用官方 `--remote` 与 `--remote-auth-token-env` 参数直接连接本 host 的官方服务。HUD 单独建立只读连接，不转发、截取或改写 TUI 消息。
- 本模式只管理一个实际 TUI 前端；使用明确登记的进程实例、host 身份与服务关联，不以窗口标题、MRU、最新日志或列表顺序选来源。不开放供其它 TUI 复用的服务管理功能。
- Node20 的 WebSocket 客户端优先复用兼容的固定版本成熟库；若现有依赖没有能力，携带最少必要的客户端库及 license，不自行实现 framing，不要求最终用户 npm install 或编译器。
- 只读取和保留状态接口所需的安全元数据，不请求对话正文、工具参数、输出或推理。接口自带工具目录时只提取服务名称与 runtimeStatus，不保存目录。
- 在确认尚未启动官方 TUI 前，准备失败可使用现有普通启动回退。TUI 已启动或结果不确定后，不自动再启动另一个 Codex。
- TUI 退出后关闭本 host 的状态观察连接与服务，等待有界时间并验证退出。只控制记录了真实出生时间且仍匹配的本 host 子进程。

## 来源与会话绑定

- 保留 psmux server/source owner/实际 pane 及出生时间的现有证明；扩展记录受 owner 管理的官方 App Server 和官方 TUI 实例。
- 明确区分「CLI hook 来自实际前端 ancestry」与「新模式 hook 来自已登记的本机 App Server ancestry」，分别校验，不伪造 rootPid，不把服务进程当作前端。
- 新模式必须证明 App Server 与 TUI 都属于同一物理 host 的实际 owner，并且 TUI 使用 owner 明确传入的本机服务地址；记录实际启动事实，不从事后进程标题猜关联。
- SessionStart 仍须提供明确 session ID/transcript，核对实际 metadata，并拒绝子代理、非 CLI 或不一致来源。真实 remote TUI 的 source 字段和 hook 来源是启用新模式的验收门槛；不得因临时测试来源为 vscode 就全局放宽 isMainSession。
- 当前会话只从该 host 的有效 SessionStart/明确绑定取得；不从 thread/started 广播、loaded 列表最后一项或时间排序自动选择。
- 绑定改变、进程实例变化、前端断开或来源不符时，清空本次新增的连接状态；不能把上一 thread 的结果带到新会话。调用栏沿用现有会话切换处理。

## 连接状态

- 只读观察连接使用 initialize/initialized、thread/loaded/list 和带当前 threadId 的 mcpServerStatus/list。只有同一服务明确 loaded 的当前线程可以查询；HUD 不调用 thread/start/resume、turn/start 或配置重载来补状态。
- 状态接口分页必须处理 nextCursor，服务数上限 64；分页中途失败或超过上限时标明信息不完整，不能据不完整列表宣称某服务不存在。
- 轮询建议每 5 秒一次，单请求超时 2 秒，12 秒未取得有效状态即失效为 Unknown；不阻塞 HUD 刷新，不无限重连或创建新服务。具体时间可在实施时按已有刷新约定微调，并记录依据。
- 仅使用 runtimeStatus 的 notStarted、starting、connected、authenticationRequired、failed、cancelled、disabled；null/缺失/过期为 Unknown。authStatus、工具数、成功历史和配置不作为实时 connected 的证明。
- 官方 codex_apps/codex_tui 仍合并为一行。仅汇总当前线程完整权威清单中返回的官方服务；所有状态相同时显示该状态，不同状态显示 Mixed，存在未知状态则明确 Unknown。不能因内置工具的名称就虚构一个未返回的 MCP 连接；没有官方条目或清单不完整时保留 Unknown。
- 绑定改变、服务退出或采样失效时丢弃旧结果。安全状态记录须有 host ID、thread ID、采样时间和服务进程实例，并经现有来源校验后使用；不持久化原始接口响应或令牌。
- 调用栏继续使用现有 reader、调用 ID、时间和完成处理，不修改它的事件来源、生命周期或展示规则。当前 CLI 缺少实时开始记录的限制如实保留，不作为本次新增转发链路的理由。

## 验收与实施门槛

- 默认 cli 模式全量回归；现有来源校验的拒绝用例继续成立。
- 新模式覆盖原生 exe/npm 入口、Node20、PS5/可选 PS7、literal argv、退出状态、连接失败和「不重复启动」。
- 真实同机官方后端加本机测试 MCP，验证带 threadId 的连接状态、失效回退、分页和断开处理；明确标为受控测试服务。
- 只读客户端验证请求 ID、超时、响应上限、断开、分页及无重叠轮询；不能发起模型回合、线程恢复或配置修改。
- 安全来源测试覆盖其它 host/thread、PID 复用、伪造 server、非 CLI metadata 和错误前端连接；不以放宽现有证明使测试通过。
- 实际官方 TUI 下，验证 main SessionStart、resume/clear 来源与绑定；该人工阶段需用户启动或恢复，不能以 mock 测试替代。
- 在真实用户线程核对官方/第三方连接状态及状态失效回退。调用栏原有行为做回归；此前第三项缺少活动行证据继续单独记录，不声称本次状态查询补齐了调用事件。
- 发布包固定携带新增依赖和 license；运行相关 Node20 检查、串行全量及离线包检查。无相关变化时复用已通过检查。
- 日常实现不自动发布、推送或重装；依项目约定在明确授权后执行正式发布流程。

## 尚未通过的关键证据

可行性已证明 Windows 认证传输、同服务双客户端和线程级真实状态接口。正式 remote TUI 的 source/hook 形态及最终 HUD 连接状态显示尚未实施或实测。先通过这些门槛，再启用新模式；若官方 TUI 的实际来源无法可靠证明，停止该路径并报告，不降低现有身份要求。调用栏的真实活动验收限制独立保留，用户已明确不将其实现改造纳入本次范围。
