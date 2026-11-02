# Codex CLI 状态信号兼容性核查

日期：2026-11-02；版本：本机 `codex-cli 0.166.0`、Python 3.13。

状态：**兼容性关口尚未通过，产品实现未开始**。探测器的单元测试不代表真实授权/回答场景通过。

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

- [ ] 授权框出现时记录等待；批准后长命令尚未完成时取得解除等待的可靠信号。
- [ ] 拒绝授权后恢复；取消/中断和下一回合不残留旧等待。
- [ ] 同步提问等待及回答后恢复。
- [ ] 异步提问：区分调用立即返回与用户真正作答。
- [ ] 并发工具和晚到的旧事件不串线。
- [ ] 正常退出后的真实锁释放与会话移除。

缺失信号时保持本关口未通过，不将 Task 2–6 标记为已开始，不用固定超时或 PostToolUse 冒充批准回执。

## 来源

- [OpenAI Hooks](https://developers.openai.com/codex/hooks)：公开事件与字段。
- 本机 `codex --help`、`codex app-server --help`、`codex app-server daemon version` 和 `codex app-server generate-json-schema --out <临时目录>`。
- 本次 worktree 中探测器与可重复运行的 8 项单元测试。
