# AI Chat Scope source

`scope.pyw` 是 Tk 窗口入口；推荐从 `../scripts/start_scope.py` 启动。直接运行也不在源码目录生成字节码缓存。

| 模块 | 职责 |
| --- | --- |
| session_types | (provider, session_id) 标识的快照 |
| claude_source | 原 Claude registry、标题、后台与过滤 |
| codex_source / jsonl_reader | 活跃锁、增量日志和有预算的发现 |
| codex_live | 已初始化 CLI 专用服务的只读客户端 |
| codex_wait | 异步待输入；实际用户消息解除注意状态 |
| codex_hooks / runtime_paths | 被动 hook、有限元数据、配置兼容与原子保存 |
| monitor | 每来源独立线程；Tk 只取最新快照 |
| win32_support | 只读锁探测与本应用实例保护 |

主循环不枚举或打开其他进程。只有用户确认关闭 Claude 后走原来的子进程流程，Codex 没有关闭入口。

运行目录为 `%LOCALAPPDATA%\ai-chat-scope\`；`AI_CHAT_SCOPE_RUNTIME` 为独立测试覆盖该目录。源会话及旧配置不被改写。使用标准库，无构建步骤，详见[插件 README](../README.md)。
