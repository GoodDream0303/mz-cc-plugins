# Scope /clear 会话切换设计

## 目标与授权

Codex CLI 在同一个进程内保留 /clear 前后两个聊天的写锁。Scope 应在可靠识别出切换后只显示该 CLI 的当前聊天，其他独立 CLI 继续显示。关闭保护保留。

用户已同意：复用 SessionStart hook，在启动和 /clear 时一次性核对独立 CLI 身份，记录最少的切换信息；先测试验证有效，未经验证不发布重装。恢复旧会话也必须重新显示正确的聊天。

## 方案

- 采用已获同意的 hook 元数据方案：startup / clear / resume 时，hook 的短命 Python 进程按本次会话锁核对 PID、进程创建时间和交互运行方式。浮窗来源不访问进程。
- 手动移除旧行会增加操作，无法自动跟随 /clear，未采用。
- 仅靠工作目录、时间或写锁猜测会混淆独立 CLI，未采用。

## 数据与显示规则

- 每个会话在现有 runtime/codex/<home-key>/<session-id>/lifecycle.json 保留一份原子更新的记录；独立 CODEX_HOME 相互隔离。
- 仅保存 schema_version、session_id、start_source、observed_ns、owner={pid,started}、recording_name。不保存提示词、命令行、工具参数、回答或令牌。
- recording_name 必须来自该 home/sessions 内与当前会话 ID 匹配的 transcript_path。它将记录限定在本次日志文件，避免旧元数据跨恢复错误生效。
- 同一 PID 和创建时间的一组可核对会话，按系统单调时钟的最新 SessionStart 选择当前待机会话。执行和待输入行始终保留，避免隐藏同 CLI 内仍活跃的后台 root；最新时间相同、记录缺失/损坏、日志文件不匹配、锁不确定时保持显示。
- 收到新的 startup / clear / resume 时，在身份查询前失效本 SID 的旧 marker；查询失败或 transcript_path 不可核对也不复用旧身份。
- 必须等新聊天有完整可显示的日志记录后，才移除同组旧行；不清空窗口作为切换过渡。
- 不同 CLI、PID 重用、共享服务、未知运行方式、没有 lifecycle 信息的旧会话均不按此规则隐藏。
- 重启 Scope 可重读有效元数据。未启用/未信任 hook 时保留原文件观察和关闭保护，不假装自动识别已生效。

## 约束

Windows；Python 3.9+ 标准库；沿用现有 1 秒轮询，不增加监视线程、常驻 helper、依赖或 SQLite。原始会话文件不写入；用户 hook 信任状态不自动修改。仅在 SessionStart 的 startup / clear / resume 触发一次身份核对；compact 和工具事件不查询进程。

## 验收

1. 回归测试先失败再修复：同一 CLI A→B 仅显示 B；独立 C 保留；resume A 恢复 A；进程身份变化、旧录制文件、缺失/损坏和同时间戳不误隐藏。
2. hook 仅输出空 JSON，身份查询/存储失败不阻断 CLI，现有 3 秒执行预算保留。
3. 独立真实 Codex 0.167.1 中驱动 /clear 和 /resume，检查实际行、ID、锁与进程存活，最后正常 /quit。
4. 区分手动调用 hook 的完整数据链验证与 Codex 原生自动派发。原生派发遇到 Hooks need review 时，先完成其余验证，再让用户审阅具体测试 hook，不自动授信或使用绕过开关。
5. 产品及根目录现有测试、diff --check 和 Python 3.9 语法检查通过；普通开发不自动发布。

原生验收已覆盖同 CLI 缓存恢复：Codex 0.167.1 可沿用原日志文件名，resume 的 transcript_path 还可能带 Windows `\\?\` 驱动器路径前缀；规范化该拼写后仍检查同一数据根。实测原生 startup、clear、resume 都在该聊天首轮消息触发，空聊天不保证立即更新。若完全没有新事件且复用同名日志，文件名本身不能证明切换发生，不能扩大为所有停用 hook 场景均能识别。

## 原生验证结果

隔离 CODEX_HOME、两个真实 Codex CLI 0.167.1、原生 SessionStart 自动派发、打包的 Windows hook 入口。响应由 127.0.0.1 的固定测试服务提供，四个测试回合不连接云端模型。

- 初始 A、独立 C 同时显示；A 执行 /clear 并向 B 发首轮消息后仅显示 B、C。
- 重建 Source 后仍显示 B、C；同 CLI 恢复 A 并发首轮消息后显示 A、C。
- 旧 A 的 inspect 和 close 都取消结束操作，CLI 继续运行；两个专用 CLI 最后均正常 /quit，全部测试锁释放。
- 直接调用打包入口的四次链路耗时约 0.50–0.59 秒；这是本机短时数据，不代表所有机器和并发负载。
- 原生恢复最初因扩展路径被拒绝，新增回归先 RED，驱动器前缀规范化后 GREEN，随后重新完成原生矩阵。
