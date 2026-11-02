---
name: scope-show
description: Use when 用户明确要求打开 AI Chat Scope，或查看 Windows 上多个 Claude Code/Codex CLI 会话的悬浮状态窗。
disable-model-invocation: true
---

# 启动 AI Chat Scope

Windows、Python 3.9+。Claude Code 与 Codex 共用一个轻量 tkinter 窗口。

1. 根据**本次实际加载的 SKILL.md 路径**确定插件根：技能文件所在目录向上两级。不要依赖可能未设置或属于另一插件的环境变量。
2. 用当前宿主的 shell 工具执行以下 PowerShell 命令，把占位路径换成已确定的绝对路径：

```powershell
python -B "<实际插件根>\scripts\start_scope.py"
```

启动器选择无窗口 Python；同一运行目录只保留一个实例。若窗口已经打开，继续使用现有窗口，不自动关闭它或任何 CLI。用户明确要换新版时，可请用户从旧窗菜单退出后再启动。不要把启动器的成功返回当作已看见新窗口。

向用户简短说明：`CC`=Claude、`CX`=Codex；红=需要用户、绿=执行、黄=待机、蓝=Claude 后台会话。`SYNC`/`STALE` 表示状态同步中/暂未更新，悬停可看详情。

Codex 的完整授权/同步问答提示需要显式配置的 CLI 专用实时服务；它应先由 CLI 初始化，再打开浮窗。未配置时仍能显示普通 CLI 的执行/待机及已识别的异步待输入状态，底部会说明授权提示未启用。不要承诺所有 Codex 红灯已经可用。

仅当用户已经给出实时端点和令牌文件路径时，把两者作为独立参数转交启动器；令牌内容不进入命令、对话或配置。不要自行启动服务、安装插件、修改 CLI 全局配置或授予 hook 信任。需要配置时参阅本插件 [README](../../README.md)。
