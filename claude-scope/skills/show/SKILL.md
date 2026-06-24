---
name: show
description: 启动 claude-scope 悬浮窗,实时监视各 Claude Code 会话的"执行中/待机/需要你"状态。用户需要看多会话状态时手动触发。
disable-model-invocation: true
allowed-tools: Bash
---

# 启动 claude-scope 悬浮窗

本插件自带悬浮窗程序 `bin/claude-scope.exe`(Windows,无控制台、置顶半透明)。
下面这条命令在插件上下文里直接后台启动它(若已在运行,再开一个也会读同一份配置/标记,通常无害):

!`"${CLAUDE_PLUGIN_ROOT}/bin/claude-scope.exe" & echo "claude-scope 已启动 (PID $!)"`

启动后请告诉用户:悬浮窗已拉起;绿灯=执行中、黄灯=待机、红灯=需要你(等授权/回答)。
红灯由本插件的 Notification/UserPromptSubmit hook 驱动(已随插件自动注册,标记写在 `~/.claude/.scope/attn/`)。
