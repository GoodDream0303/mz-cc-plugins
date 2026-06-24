# mz-cc-plugins

mzzhu2 的 Claude Code 插件市场。**只需 add 一次 marketplace**，即可安装下列全部插件。

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
```

## 插件

| 插件 | 安装 | 说明 |
|------|------|------|
| **claude-scope** | `/plugin install claude-scope@mz-cc-plugins` | 悬浮窗实时监视多个 Claude Code 会话状态（绿=执行中 / 黄=待机 / 红=需要你）；红灯 hook 装上即自动注册。详见 [`claude-scope/`](./claude-scope)。 |
| **task-handoff** | `/plugin install task-handoff@mz-cc-plugins` | 跨会话开发任务接力：落盘交接文档、新会话恢复、任务管理。把会话状态外置成 markdown，长任务可多会话接力。详见 [`task-handoff/`](./task-handoff)。 |

## 结构

```
.claude-plugin/marketplace.json   市场清单（列出全部插件）
claude-scope/                     插件：会话状态悬浮窗
task-handoff/                     插件：跨会话任务接力
```
