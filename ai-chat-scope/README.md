# AI Chat Scope

Windows 上的轻量置顶悬浮窗，在一个列表里查看多个 **Claude Code 与 Codex CLI** 会话。版本 2.1.0，由 claude-scope 更名。

2.1.0 新增首次 setup、Python/py 解释器发现、真实 Tk 与运行目录检查、配置初始化、启动失败日志和自定义 Claude 数据目录支持。已有配置保持不变，不自动安装系统依赖。

2.0.2 将可选实时服务的常驻能力提示移到右键菜单“状态说明”；异常提示和 SYNC/STALE 标识保留。

2.0.1 修复浮窗持续运行时不再扫描新日志的问题，使后续新建 Codex 会话及切换后的记录段能够正常更新。

| 显示 | 含义 |
| --- | --- |
| 黄色 CC / 蓝色 CX | Claude Code / Codex CLI，会话来源标记 |
| 红 / ATTN | 需要用户：授权、回答或等待用户消息 |
| 绿 / RUN | 执行中 |
| 黄 / STBY | 待机 |
| 蓝 / BG | Claude 后台会话 |
| SYNC / STALE | 正在同步 / 状态暂未更新，悬停可看说明 |

支持拖动、缩放、透明度、置顶与重启。每个来源独立后台读取，无变化不重绘。只需 **Windows、Python 3.9+ 与 tkinter**，不需要 Node、Electron 或 pip 包。本机验证环境为 Python 3.13、Codex CLI 0.166.0。

## 状态覆盖

- Claude：沿用 registry 的 waiting/idle 等状态，保留 spare/parked 去重、后台会话及右键关闭，无新增 Claude hook。
- 普通 Codex CLI：只读现有锁和增量日志，显示执行、待机与已识别的异步待输入，不把历史日志都列为活跃会话，也不枚举其他进程。
- Codex 完整授权与同步提问提示：需要连接**已由 CLI 初始化、专供 CLI 的本地实时服务**。未配置时可在右键“状态说明”查看能力范围。
- 异步题卡标记“等待用户消息”，实际收到用户输入后解除；不判定每题答案是否完整，模型结束回合也不代表用户已回答。
- 首版 Codex 行仅提供复制会话 ID，**不提供关闭**。Claude 关闭仍需点菜单并确认，优雅退出失败后另行确认才强制结束。

## 安装与启动

正式安装使用远端市场，不依赖开发工作区。首次 setup 入口从 2.1.0 开始提供。安装是用户操作，工具不自行安装、卸载或改全局配置。

Claude Code：

```text
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install ai-chat-scope@mz-cc-plugins
/ai-chat-scope:setup
/ai-chat-scope:scope-show
```

Codex CLI：

```powershell
codex plugin marketplace add GoodDream0303/mz-cc-plugins
codex plugin add ai-chat-scope@mz-cc-plugins
```

在 Codex 会话先调用 `$ai-chat-scope:setup` 初始化，再调用 `$ai-chat-scope:scope-show` 打开。支持安装后 setup 引导的宿主可直接选择 setup；其他宿主使用上述技能命令。若当前会话尚未发现新技能，重新开启会话。也可直接运行：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '<实际插件根>\scripts\scope.ps1' -Setup
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '<实际插件根>\scripts\scope.ps1'
```

同一运行目录仅保留一个实例。重复启动保留现有窗口；启动器成功表示请求已发出，不代表新建了另一个窗口。Codex hook 需要用户在宿主中审阅并信任，不自动获信任，也不自动拉起浮窗。

## 新环境初始化与故障排查

前提是 Windows 和包含 **tkinter/Tcl/Tk 的 Python 3.9+**。引导入口依次查找 `python`、`py -3`、`python3`，不要求一定存在 `python` 命令；无需 pip 包。缺少可用解释器时会明确提示安装或修复 Python，而不会自动下载、安装依赖或修改 PATH。[Python Windows 安装说明](https://docs.python.org/3/using/windows.html)

`-Setup` 会实际验证 Tk 能创建隐藏窗口、插件入口存在、运行目录可写，并仅在缺失时创建 `%LOCALAPPDATA%\ai-chat-scope\config.json`。旧版窗口设置可迁入新配置，旧文件不修改；已有新配置逐字保留，重复执行安全。损坏的新配置会明确报错，需先自行备份修复，程序不覆盖它。

初始化只检查环境，不打开浮窗。正常启动入口也会执行同样的检查并初始化缺失配置，因此依赖齐全时可以直接启动。只想诊断时将 `-Setup` 改成 `-Check`，不创建或修改配置；检查可能创建运行目录和临时写入探测文件。

| 项目 | 默认位置 | 当前进程自定义 |
| --- | --- | --- |
| Claude 数据根 | `~/.claude` | `CLAUDE_CONFIG_DIR` |
| Codex 数据根 | `~/.codex` | `CODEX_HOME` |
| Scope 配置与日志 | `%LOCALAPPDATA%\ai-chat-scope` | `AI_CHAT_SCOPE_RUNTIME` |

自定义变量应设置在启动浮窗的同一环境中。无需两个 CLI 都安装；某个来源尚无会话目录时仅提示，之后可继续发现会话。初始化不会创建或修改 CLI 的数据目录、全局配置或权限。CLI 数据格式的本机验证版本仍为 Codex CLI 0.166.0，不承诺所有其他版本。

setup 失败以终端的具体诊断为准。后台窗口在 Python 导入或启动阶段失败时，检查运行目录的 `startup.log`；窗口运行后的异常见 `error.log`。不会把缺少 Python/tkinter 当成 hook 审批问题。基础状态监视不依赖 hook 审批；hook 启用和更新信任由用户在 `/hooks` 审阅。

## 从 claude-scope 升级

新标识为 `ai-chat-scope`，旧插件不会因更新自动更名。先从旧浮窗菜单退出，再安装启动新插件；旧插件由用户自行移除。v1.x 没有新版单实例保护，二者可同时出现，工具不会终止旧窗或 CLI。

新运行目录为 `%LOCALAPPDATA%\ai-chat-scope\`。新配置不存在时，只读回退到旧 `%LOCALAPPDATA%\claude-scope\config.json` 的窗口字段；保存只写新目录，不删除或改写旧配置。保存位置会保留已有实时服务设置。

## 可选：Codex 授权与同步问答实时提示

采用官方 app-server 只读查询，不接管当前 CLI，不向模型发起任务，不发送授权决定。仅支持显式的 `ws://127.0.0.1:<端口>` 和令牌文件认证。另起独立 app-server 无法自动观察普通直连 CLI 的内存状态。

**启动顺序：服务 → 先连接 CLI → 再打开浮窗。** 本机版本首个 initialize 会影响 originator；浮窗不自动创建服务。端点专供 CLI，不据此宣称支持 Codex Desktop。

1. 在一个 PowerShell 窗口创建令牌并运行服务，已有令牌不覆盖：

```powershell
$tokenFile = Join-Path $env:LOCALAPPDATA 'ai-chat-scope\codex-service.token'
if (-not (Test-Path -LiteralPath $tokenFile)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $tokenFile) | Out-Null
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    [IO.File]::WriteAllText($tokenFile, $token, [Text.UTF8Encoding]::new($false))
}
codex app-server --listen ws://127.0.0.1:4500 --ws-auth capability-token --ws-token-file $tokenFile
```

2. 在另一 PowerShell 窗口先连接 CLI：

```powershell
$tokenFile = Join-Path $env:LOCALAPPDATA 'ai-chat-scope\codex-service.token'
$env:AI_CHAT_SCOPE_CODEX_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
codex --remote ws://127.0.0.1:4500 --remote-auth-token-env AI_CHAT_SCOPE_CODEX_TOKEN
```

3. 从菜单退出已有 AI Chat Scope 实例，再启动带设置的新实例：

```powershell
$tokenFile = Join-Path $env:LOCALAPPDATA 'ai-chat-scope\codex-service.token'
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '<实际插件根>\scripts\scope.ps1' -CodexEndpoint ws://127.0.0.1:4500 -CodexTokenFile $tokenFile
```

窗口保存设置后，可直接通过 scope-show 启动。配置只存端点和令牌文件路径；令牌内容不进入命令或配置。服务不可用时显示未更新/能力提示，不把旧授权标记假装成当前状态。

## 数据与边界

- 原始数据只读：Claude registry/jobs/transcript 尾部；Codex 锁、增量 rollout 和标题索引。
- 不用 SQLite，不探测其他进程，不采集 CPU/RAM，不监听端口；实时功能连接用户已有本地服务。
- Codex hook 仅在本工具运行目录记录版本、事件、ID、工具名与时间，不记录提示词、命令、参数、问题、选项、回答或令牌；近期元数据有保留上限。
- Codex 专属配置为 `hooks/codex-hooks.json`，仅 Codex 清单引用；不放默认 `hooks/hooks.json`，避免 Claude 自动加载。
- 状态含义和 Codex 实时服务的能力说明见浮窗右键菜单“状态说明”；未配置可选服务不显示常驻底部提示，读取或连接异常仍会提示并在恢复后消失。
- 右键关闭只针对用户确认的 Claude 会话，保留原有子进程退出流程；其他监视过程不关闭会话。
- 不写源码目录，不自动改 CLI 配置，不自动保存助手跨会话记忆。

## 开发验证

在仓库根运行：

```powershell
python -B -m unittest discover -s ai-chat-scope/tests -v
python -B -m unittest discover -s tests -v
```

真实 CLI 和后台测试见[兼容性验证](../docs/superpowers/validation/2026-11-02-codex-signals.md)。Tk 布局、拖动、缩放、透明度、置顶和单实例重启单独验证；未完成的宿主人工安装体验不描述为通过。

实现参考 [Agent HUD](https://github.com/jazzenchen/agent-hud-open) 的题卡身份思路与 [ARIS-Monitor](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/tree/main/aris-monitor) 的文件扫描边界，没有依赖或运行这些项目。Desktop 专用回答标记不作为 CLI 通用接口。
