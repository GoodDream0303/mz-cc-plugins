# AI Chat Scope source

`scope.pyw` 是 Tk 窗口入口；推荐使用 `../scripts/scope.ps1` 发现 Python 并调用 `start_scope.py`。`-Setup` 仅初始化，`-Check` 仅检查。直接运行也不在源码目录生成字节码缓存。

| 模块 | 职责 |
| --- | --- |
| session_types | (provider, session_id) 标识的快照 |
| claude_source | 原 Claude registry、标题、后台与过滤 |
| codex_source / jsonl_reader | 活跃锁、增量日志和有预算的发现 |
| codex_live | 已初始化 CLI 专用服务的只读客户端 |
| codex_close | 用户选择关闭后的短命 helper：精确锁持有者、进程身份核对与确认后结束 |
| codex_lifecycle | SessionStart 的一次性身份元数据与只读显示筛选；按 PID/创建时间、录制文件和事件顺序区分同 CLI 的旧行 |
| codex_wait | 异步待输入；实际用户消息解除注意状态 |
| codex_hooks / runtime_paths | 被动 hook、有限元数据、配置兼容与原子保存 |
| monitor | 每来源独立线程；Tk 只取最新快照 |
| win32_support | 只读锁探测、本应用实例保护与按需置顶恢复 |
| setup_environment | Tk/目录检查、仅缺失时初始化配置、数据根报告 |

主循环不枚举或打开其他进程。Claude 关闭保留原有子进程流程。Codex 右键关闭先由独立 helper 用 Restart Manager 查询所选写锁的唯一持有者，读取其可执行文件、运行模式及创建时间，并检查同一锁目录内其他活跃锁是否也属于该进程；主线程显示明确的强制结束确认。确认后另起 helper 重新核对锁持有者、进程创建时间及其他活跃锁，通过同一已核对的进程句柄结束独立 CLI，并等待退出、确认锁释放。共享 app-server、非交互模式、身份变化、同一 CLI 持有多个会话锁或无法核对均取消，不退回广泛进程扫描或 taskkill。会话原始文件与归档状态不变，关闭成功后由正常轮询移除行。

用户已授权 SessionStart hook 对本次会话锁做一次只读身份核对，复用 session_owner；它不要求该 CLI 只有一个会话，且不申请结束权限。仅 startup / clear / resume 捕获 PID、创建时间、系统单调时钟及录制文件名，原子更新对应 home/session 的 lifecycle.json。Source 在构建完整快照后只读有效记录，按 (pid,started) 分组选择时间最新且唯一的一条；缺失、损坏、录制文件变化、锁不确定及并列时间戳均保留显示。Scope 重建可重读记录，不新增轮询或进程访问；共享服务/未知运行方式无法产生有效身份记录。

其他锁查询前后比较目录项，期间新增或删除锁就取消。该检查是只读快照，不能与 CLI 切换会话原子协调：已存在的释放锁在扫描中重新被持有，以及最终复核到结束进程之间的切换，仍不能据此保证线程级隔离。

新的 SessionStart 先失效同 SID 的旧 lifecycle marker，查询成功才写入新身份；失败时不复用旧记录。Source 对 run / attn 行始终保留，避免隐藏后台工作。完全未派发事件且复用同名日志的恢复，无法仅凭现有文件辨认，必须单独完成原生派发验收；外部调用 hook 的数据链测试不代表该项通过。

Codex 0.167.1 原生矩阵已验证 startup / clear / resume 在首轮消息时自动派发，包含同名录制文件的恢复。resume 提供的扩展驱动器路径先规范化再检查数据根；不放宽到任意设备路径。空聊天尚未派发事件时沿用最近可核对状态。

运行目录为 `%LOCALAPPDATA%\ai-chat-scope\`；`AI_CHAT_SCOPE_RUNTIME` 为独立测试覆盖该目录。源会话及旧配置不被改写。使用标准库，无构建步骤，详见[插件 README](../README.md)。

Windows hook 走 `cmd` 到 `py -3`/`python`/`python3` 的直接路径，保留宿主的3秒预算，避免每次额外启动 PowerShell 和 Python 版本探测进程。内联 `-c` 参数保持无空白且不用 shell 重定向字符，因此版本比较使用 `version_info.__ge__`；路径仅在 Python 内从环境读取，不插入 shell。`-I -B` 隔离调用项目的 Python 模块并禁止字节码文件。缺少解释器或运行失败时返回空 JSON，不改变授权决定；GUI/setup 仍使用 scope.ps1。

子 CMD 进程设置 `NoDefaultCurrentDirectoryInExePath=1`，使解释器仅按 PATH 解析，避免调用项目中的同名 py/python/python3 程序抢先执行；不修改用户的全局环境。该开关与 Python `-I` 分别覆盖可执行文件和模块查找，均有真实临时项目回归。
