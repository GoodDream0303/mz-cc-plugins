# Codex CLI 状态信号兼容性核查

日期：2026-11-02；版本：本机 `codex-cli 0.166.0`、Python 3.13。

状态：**用户已选择继续验证只读实时协议；真实授权恢复、拒绝/中断和关闭测试窗口已取得证据，完整兼容性关口尚未通过，产品实现未开始**。同步提问尚待实测；异步提问需要单独汇总日志信号。

## 已取得的证据

| 核查项 | 方法与实际结果 | 能支持的结论 |
| --- | --- | --- |
| 日志中的回合生命周期 | 对本机会话元数据及近期日志只读统计，观察到 `task_started`、`task_complete`、`turn_aborted`；只输出类型与字段形状 | 可继续验证执行/待机；尚不能据此证明授权处理后的即时恢复 |
| 当前版本公开 hook | 官方 Hooks 文档列出 PermissionRequest、PreToolUse、PostToolUse、Stop、Interrupt、SessionEnd；没有独立的 PermissionResponse hook | PostToolUse 在工具结束时才出现，不能直接视为用户批准回执 |
| 本地协议的直接状态信号 | 本机命令 `codex app-server generate-json-schema` 成功；生成文件仅用于核查，已清理 | 协议定义具备正确的等待语义，但定义存在不等于当前 CLI 可被动观察 |
| app-server 状态枚举 | `ThreadStatus` 为 notLoaded/idle/systemError/active；activeFlags 为 waitingOnApproval、waitingOnUserInput | 如果能在对应 CLI 使用的服务上观察状态，可以准确表达两种等待状态；尚未建立此连接 |
| 请求完成通知 | 生成协议包含 `ServerRequestResolvedNotification`，字段为 requestId、threadId | 可继续研究等待的解除信号，但它是 app-server 通知，不是文件日志或 hook 回执 |
| 本机共享服务连接 | `codex app-server daemon version` 失败，目标 `~/.codex/app-server-control/app-server-control.sock`，OS error 10050 | 当前未成功连上共享服务；不能推断所有 CLI 都没有该功能，也不能自动改用或启动服务接管现有会话 |
| 探测器安全边界 | `python -B -m unittest discover -s tests -p test_codex_scope_probe.py -v`：8 项通过，经历了缺实现时 8 项失败的 RED 阶段 | 只验证探测器行为：白名单过滤、1 MiB 上限、静默失败、配置保留、含空格/单引号/中文路径执行、完成事件不能证明批准回执 |
| 日志捕获边界 | 临时输入文件包含超过 1 MiB 的记录、随后有效完成事件、最后半行；有效事件被保留，其余跳过，输入文件字节不变，输出不含模拟的回答正文 | 有界读取和脱敏的窄验证，不代表真实授权处理测试 |
| 真实授权与长命令（用户操作） | 用户在独立 CLI 中批准后执行 Start-Sleep；对应日志记录成功，耗时 10.462838600 秒 | 授权和实际执行已验证，但产品要求的即时恢复信号没有通过 |

## 首个真实场景结果

用户完成了授权确认，测试 hook 确实运行。该测试会话记录到 SessionStart ×1、PreToolUse ×2、PermissionRequest ×1、PostToolUse ×1、Stop ×1。

以 PermissionRequest 的观察时刻为零点：

| 相对时刻 | 事件 | 说明 |
| --- | --- | --- |
| 0 | PermissionRequest | 能观察即将请求授权，但没有 tool_use_id 字段 |
| +19.887914100 秒 | PostToolUse | 此时命令已经执行完成；带 exec 类工具调用 ID |
| +24.284743200 秒 | Stop | 回合结束 |

这两个 hook 之间没有其他探测回执。只读检查该测试会话 rollout，执行开始事件（item_started 或 exec_command_begin）计数为 0；完成项时间为 `2026-11-02T11:41:10.680Z`，状态 completed，duration 为 10 秒 462838600 纳秒。

因此，**不能用 PostToolUse 实现“用户批准后、命令完成前恢复绿灯”**：它会让红灯继续覆盖这段长命令执行。19.887914100 秒包含了用户处理和命令执行，不能反推批准的精确时刻。这个结论限于本机版本及本次真实执行路径，不据此宣称所有版本或所有工具都不存在其他信号。

用户已选择继续验证 app-server 的只读实时状态渠道；未接受授权后红灯延迟到工具完成的降级。

## 只读实时协议：真实验证结果

启动了本次专属的临时 loopback WebSocket app-server，以能力令牌认证；连接地址及令牌不写入仓库。只读观察者与实际 Codex CLI 是两个独立连接。测试服务没有替换或重启用户原有 CLI 的服务。

观察者只发送 initialize、initialized、thread/loaded/list、thread/read（includeTurns=false），不 resume、不订阅、不提交 turn，不回答任何服务端授权或问题。工具为 `tools/codex_live_probe.py`，Python 标准库实现，输出仅有会话 ID、状态、已知等待标志及观测时间。

### 允许授权后的长命令

| UTC 时间 | 实际状态 |
| --- | --- |
| 11:52:07.097590 | active，waitingOnApproval，映射红灯 |
| 11:52:08.829354 | active，无等待标志，映射绿灯 |
| 11:52:19.016 | 对应命令完成；实际运行 10.531031600 秒 |
| 11:52:23.819414 | idle，映射黄灯 |

恢复绿灯的观测发生在命令完成前 **10.186646 秒**，满足本次最关键的恢复要求。观察周期为 0.5 秒；这些时间为轮询观测时刻，不能当作用户点击的精确时刻。

### 关闭窗口与拒绝授权

- 用户关闭该测试 CLI 后，观察者在 11:58:56.310453 的 loaded/list 结果中不再看到它；只读读取没有维持该测试会话的订阅。
- 新测试窗口在 12:00:07.988752 出现 waitingOnApproval；用户取消授权后，12:00:14.917774 已回到 idle、无等待标志；对应日志有 turn_aborted。此路径验证的是用户取消导致的中断，不等同于所有“拒绝但继续回合”分支都已测过。

### 异步提问：已经调用工具，状态标志未出现

此前“只是正文提问”的判断已纠正：实际日志记录 `request_user_input_async` 于 12:00:43.560 调用，12:00:43.676 返回 accepted=true；用户的下一条输入于 12:01:14.031 以 UserMessage 项进入同一回合。这段约 30 秒的等待期间，实时观察没有出现 waitingOnUserInput。

因此，不能仅凭 ThreadStatus 覆盖异步提问，也不能把 accepted=true 当作用户已回答。可进一步验证“成功发送异步问题 → 后续真实 UserMessage”的汇总路径；只需要事件归属/顺序，不读取或保存问题、选项、回答正文。并发多个待答问题的归属仍需验证，不能先宣称完整支持。

本机工具定义中，`request_user_input` 是同步提问且限 Plan 模式；`request_user_input_async` 返回后允许模型继续工作。同步路径的 `waitingOnUserInput` 尚未在本次真实 CLI 中验收。

### 首个连接者的身份副作用与来源分类

额外使用完全独立的临时 CODEX_HOME 和临时服务，只创建无模型请求的 ephemeral 测试线程，对照结果如下；测试进程和目录均已清理：

| 首个 initialize | --startup-client-info | 后续测试线程 originator |
| --- | --- | --- |
| 观察者 | 未设 | scope_identity_observer |
| Codex CLI 标识 | 未设 | codex-tui |
| 观察者 | 指定 codex-tui | 仍为 scope_identity_observer |

本机版本的线程 originator 取决于首个 initialize，单纯传 --startup-client-info 没有消除这一行为。三种情况的 source 都为 vscode；实际 remote CLI 创建的线程也如此，不能对实时渠道照搬 `source == cli` 的文件过滤。

后续接入必须明确这些限制：观察者只附着到已经由 CLI 初始化的服务，不能抢先初始化空服务；也不能根据 source=vscode 就错误排除真实 remote CLI。若采用专供 CLI 的显式配置端点，可用 threadSource/parentThreadId 过滤子线程，但不能宣称可在混用的服务里完美识别 CLI 与桌面应用。暂未把这些条件写成已获批准的产品部署方案。

### 自动验证

`python -B -m unittest discover -s tests -p 'test_codex*_probe.py' -v`：16 项通过。新增实时探测器的 8 项测试经历缺少实现时全部失败的 RED 阶段，覆盖等待标志、只读 RPC 白名单、不回答服务端请求、不 fetch turns、帧掩码、截断/超长帧以及仅允许 loopback 端点。真实状态证据来自上面的实际 CLI，不由单元测试替代。

## 本地协议摘录

这些字段由**本机安装版本**生成，未用远端 main 分支替代当前版本：

```text
ThreadStatus = notLoaded | idle | systemError | active { activeFlags }
ThreadActiveFlag = waitingOnApproval | waitingOnUserInput
ThreadStatusChangedNotification = { threadId, status }
ServerRequestResolvedNotification = { requestId, threadId }
```

上述协议属于另一种状态接入渠道。批准的方案仍是日志与插件 hook；如果必须依赖共享服务才能正确解除等待，需要向用户说明接入变化和覆盖范围，不能静默扩大方案。

## 隔离探测入口

工具为 `tools/codex_scope_probe.py`，不更改用户全局配置，不安装或卸载插件，不预填模型任务：

```powershell
python -B tools/codex_scope_probe.py --prepare '<独立测试目录>'
codex --no-daemon -a on-request -s read-only -C '<独立测试目录>'
python -B tools/codex_scope_probe.py --report --root '<独立测试目录>'
```

测试目录中已有 `.codex/hooks.json` 时，prepare 必须拒绝覆盖。探测脚本路径在生成配置时解析；仅适用于本次本机兼容性实验，不作为插件发布入口。

需要用户在独立测试窗口审阅并信任 hook，然后自行输入测试任务与处理提示。不得使用绕过 hook 信任的选项，不替用户批准请求。

探测事件只包含版本、来源、会话/回合/工具调用 ID、事件类型、工具名及单调时间；不包含 prompt、tool_input、命令、问题、回答、cwd 或 transcript 正文。事件写在测试目录的 probe-events 中。报告仅汇总事件类型，不自行宣称“已证明授权恢复”。

## 尚未通过的真实场景

- [x] 实时渠道在授权框出现时记录等待；批准后长命令尚未完成时取得解除等待的可靠信号。日志＋hook 单独使用时仍未通过。
- [ ] 拒绝授权后恢复；取消/中断和下一回合不残留旧等待。
- [ ] 同步提问等待及回答后恢复。
- [ ] 异步提问：区分调用立即返回与用户真正作答。
- [ ] 并发工具和晚到的旧事件不串线。
- [x] 关闭实际 remote CLI 测试窗口后，实时 loaded/list 中会话移除；直接 CLI 文件锁释放仍应单独验收。

缺失信号时保持本关口未通过，不将 Task 2–6 标记为已开始，不用固定超时或 PostToolUse 冒充批准回执。

## 来源

- [OpenAI Hooks](https://developers.openai.com/codex/hooks)：公开事件与字段。
- 本机 `codex --help`、`codex app-server --help`、`codex app-server daemon version` 和 `codex app-server generate-json-schema --out <临时目录>`。
- 本次 worktree 中探测器与可重复运行的 8 项单元测试。
