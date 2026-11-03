---
name: setup
description: Use when 用户从市场安装 AI Chat Scope 后需要首次初始化，迁移到新 Windows 环境，或启动时报 Python、tkinter、运行目录及数据路径错误。
---

# 初始化 AI Chat Scope

根据本次实际加载的 SKILL.md 所在目录向上两级确定插件根，不依赖开发工作区或其他插件的环境变量。使用打包的 PowerShell 引导入口，自动查找 `python`、`py -3` 或 `python3`。

用当前 shell 工具执行，替换为实际插件根并按 PowerShell 字面量正确引用路径（路径中的单引号写成两个单引号）：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '<插件根>\scripts\scope.ps1' -Setup
```

`-Setup` 实际检查 Python 3.9+、tkinter/Tk、插件入口和运行目录写入权限；仅在配置缺失时初始化，保留已有配置及旧版配置原文件。检查会短暂创建隐藏的 Tk 窗口，不打开浮窗。`-Check` 可复查环境而不创建或修改配置；它可能创建运行目录并做临时写入探测。

以脚本退出码和报告为准。失败时说明具体缺项与修复方法，不宣称初始化成功。缺少 Python/Tcl/Tk 时由用户安装或修复后重试；不要擅自安装依赖、重装插件、修改 CLI 全局配置或 hook 信任。

报告会列出运行目录、配置路径和 Claude/Codex 数据根。尊重当前进程的 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`；若用户使用自定义数据根而当前环境尚未设置，使用其提供的路径在当前进程设置后重新执行，不猜测或持久改写其 shell 配置。尚无会话目录只是提示，不要求两个 CLI 都安装或已启动。

初始化成功后，用户可调用 `$ai-chat-scope:scope-show`（Codex）或 `/ai-chat-scope:scope-show`（Claude）。也可用同一条 PowerShell 命令去掉 `-Setup` 启动。用户仅要求初始化时，到此结束；用户同时要求打开浮窗时，再执行启动命令，不关闭现有窗口或 CLI。

基础监视可直接使用。完整 Codex 授权/同步问答提示需用户按 [README](../../README.md) 配置 CLI 专用实时服务；不自行启动服务或创建令牌。Codex hook 由用户在 `/hooks` 审阅并信任，安装成功不代表已批准 hook。令牌内容不得进入对话、命令或配置。
