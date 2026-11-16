# Scope /clear Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 用可核对的 SessionStart 元数据移除同一独立 CLI 的旧聊天，保留其他 CLI 和缺少证据的行。

**Architecture:** hook 按自己的会话写锁读取一次独立 CLI 身份，原子写入每会话 lifecycle.json；CodexSource 只读这些小文件并在构建完整快照后选择每个进程身份的最新会话。

**Tech Stack:** Windows，Python 3.9+ 标准库，现有 Restart Manager/进程身份封装、unittest。

**Spec:** docs/superpowers/specs/2026-11-16-scope-clear-lifecycle-design.md

## Global Constraints

监视过程不枚举或打开其他进程；不新增线程/常驻进程/依赖/SQLite；不写原始会话；不自动授信；保留 3 秒 hook 预算；验证前不发布重装。

## Review Focus

- PID 重用及 shared app-server 不得合并独立聊天。
- /resume 产生新录制文件时，旧 marker 不得隐藏重新打开的聊天。
- 当前 marker 尚无完整行时，不得先移除旧行。
- marker 损坏、缺失、祖先 junction 或时间戳并列必须回退显示。
- hook 原生派发和手动构造输入的数据链必须分别报告。

### Task 1: 只读身份查询与 hook lifecycle 记录

**Files:** Modify src/codex_close.py、src/codex_hooks.py；Create src/codex_lifecycle.py；Test tests/test_codex_close.py、tests/test_codex_hooks.py、tests/test_codex_lifecycle.py（路径均在 ai-chat-scope 下）。

**Interfaces:** session_owner(home,sid,system=None)->{pid,started} 只核对独立 CLI 身份，不结束进程；capture_session_start(runtime,home,payload)->None；current_session_ids(runtime,home,recordings:dict[sid,Path])->set[sid]。

- [x] 写失败测试：capture 只对 startup/clear/resume 查询一次；仅写白名单元数据，路径越界/未知身份不写 marker，失败仍输出 {}；session_owner 在同一 CLI 多锁时仍可安全读取身份。
- [x] 运行关闭、hook 和 lifecycle 专项，确认失败原因对应缺失功能。
- [x] 提取 session_owner 保留关闭前多锁保护；新模块实现路径和 schema 校验、原子 marker 写入/有界读取；hook 在原事件发布后尝试可选捕获。
- [x] 运行专项并确认全部通过，Python 3.9 可解析。

### Task 2: 显示过滤、实际 CLI 验证与交付说明

**Files:** Modify src/codex_source.py、README.md、src/README.md；Test tests/test_runtime_boundary.py、tests/test_codex_lifecycle.py；保留 tests/test_codex_source.py 既有回归。

**Interfaces:** current_session_ids 只使用有效且与当前 recording_name 相符的 marker，按 (pid,started) 分组；时间戳最新且唯一的行保留。source 在所有快照准备完毕后调用，异常时保留全部快照并给出诊断。

- [x] 写失败测试：同 CLI A→B 与独立 C；resume A；PID 重用；未知 A；缺失 B 日志；损坏/并列时间戳/旧录制文件；重建 Source；祖先 junction；poll 不调用身份查询。
- [x] 运行新增专项，确认先 RED。
- [x] 实现分组选择并接入 Source，沿用既有轮询与路径发现；更新能力范围文档。
- [x] 运行产品全套、根目录测试、diff --check 和 3.9 语法检查。
- [x] 用隔离 home 的真实 CLI 验证 A→clear B、独立 C、resume A、重建 Source、关闭保护和正常退出，先验证直接调用打包 hook 的链路与预算。
- [x] 准备只作用于隔离 home 的实际打包 SessionStart hook。原生审阅未完成则保持待用户动作，不声称原生自动派发已通过。
- [x] 整体独立只读审阅，处理具体缺陷并重跑受影响检查；不自动推送或重装。


验证结果：157 项产品回归、22 项根目录回归通过；真实 Codex 0.167.1 的原生 startup / clear / resume 矩阵通过，独立 C、Source 重建及多锁关闭保护通过，两个专用 CLI 正常退出。Python 3.9 仅语法解析通过，未运行 3.9 解释器。原生事件在首轮消息触发，空聊天不承诺立即切换。8 会话只读筛选本机 200 次中位约 12.54ms、p95 17.95ms，沿用 1 秒轮询，不作所有负载保证。
