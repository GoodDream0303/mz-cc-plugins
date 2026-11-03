# AI Chat Scope source

`scope.pyw` 是 Tk 窗口入口；推荐使用 `../scripts/scope.ps1` 发现 Python 并调用 `start_scope.py`。`-Setup` 仅初始化，`-Check` 仅检查。直接运行也不在源码目录生成字节码缓存。

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
| setup_environment | Tk/目录检查、仅缺失时初始化配置、数据根报告 |

主循环不枚举或打开其他进程。只有用户确认关闭 Claude 后走原来的子进程流程，Codex 没有关闭入口。

运行目录为 `%LOCALAPPDATA%\ai-chat-scope\`；`AI_CHAT_SCOPE_RUNTIME` 为独立测试覆盖该目录。源会话及旧配置不被改写。使用标准库，无构建步骤，详见[插件 README](../README.md)。

Windows hook 走 `cmd` 到 `py -3`/`python`/`python3` 的直接路径，保留宿主的3秒预算，避免每次额外启动 PowerShell 和 Python 版本探测进程。内联 `-c` 参数保持无空白且不用 shell 重定向字符，因此版本比较使用 `version_info.__ge__`；路径仅在 Python 内从环境读取，不插入 shell。`-I -B` 隔离调用项目的 Python 模块并禁止字节码文件。缺少解释器或运行失败时返回空 JSON，不改变授权决定；GUI/setup 仍使用 scope.ps1。

子 CMD 进程设置 `NoDefaultCurrentDirectoryInExePath=1`，使解释器仅按 PATH 解析，避免调用项目中的同名 py/python/python3 程序抢先执行；不修改用户的全局环境。该开关与 Python `-I` 分别覆盖可执行文件和模块查找，均有真实临时项目回归。
