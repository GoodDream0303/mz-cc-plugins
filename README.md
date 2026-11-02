# mz-cc-plugins

mzzhu2 的 Claude Code / Codex 插件仓库，两个宿主使用各自的市场清单。

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
```

## 插件

| 插件 | 安装 | 说明 |
|------|------|------|
| **ai-chat-scope** | `/plugin install ai-chat-scope@mz-cc-plugins` | Windows 轻量浮窗，支持 Claude Code / Codex CLI。Codex 完整授权提示需实时服务。详见 [`ai-chat-scope/`](./ai-chat-scope)。 |
| **task-handoff** | `/plugin install task-handoff@mz-cc-plugins` | 跨会话开发任务接力：落盘交接文档、新会话恢复、任务管理。把会话状态外置成 markdown，长任务可多会话接力。详见 [`task-handoff/`](./task-handoff)。 |

## 结构

```
.claude-plugin/marketplace.json   市场清单（列出全部插件）
ai-chat-scope/                    插件：双 CLI 会话状态悬浮窗
task-handoff/                     插件：跨会话任务接力
```

## Codex HUD

[Codex HUD](codex-hud/README.md) is a separate, configurable multiline HUD for
native Windows Terminal. Its Codex marketplace is `.agents/plugins/marketplace.json`;
it is independent of AI Chat Scope and can be used alongside it.

## Codex 安装

在包含对应版本的已发布仓库中：

```powershell
codex plugin marketplace add GoodDream0303/mz-cc-plugins
codex plugin add ai-chat-scope@mz-codex-plugins
```

本地验收用仓库根绝对路径代替 GitHub 来源。安装后调用 `$ai-chat-scope:scope-show`；旧插件退出与改名配置兼容步骤见插件 README。
