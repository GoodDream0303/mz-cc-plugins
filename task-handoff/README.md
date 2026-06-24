# task-handoff —— 跨会话开发任务接力插件

把会话状态**外置**成 markdown 交接文档,让一个长任务可以由**多个 Claude Code 会话接力完成**,
中途无需重复描述背景。解决两个痛点:单会话上下文过长导致变慢/不足;新开会话又得从头交代。

## 它提供什么

三个技能(命名空间前缀 `task-handoff:`):

| 技能 | 作用 |
|------|------|
| `/task-handoff:task-save` | **落盘**:把当前进展总结进交接文档 `handoff.md`,同步总账 `INDEX.md`。当你说"准备新开会话/先到这"时也会主动触发。 |
| `/task-handoff:task-resume` | **接力**:新会话里读回某任务的交接文档,复述确认后从"下一步"继续。带任务名定位,留空则列出进行中任务。 |
| `/task-handoff:task-manage` | **管理**:删除任务、改编号/重命名/改状态、归档已完成、清理体检 INDEX 一致性。 |

数据结构:你配置的根目录下,每个任务一个独立文件夹(`简明任务名_日期/`),内含 `handoff.md`;
根目录一份 `INDEX.md` 作总账。所有文档 UTF-8。

## 安装

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install task-handoff@mz-cc-plugins
```

安装时会提示填 **接力文档根目录**(`handoff_root`)——即交接文档存放位置,
例如 `D:/ClaudeTasks` 或默认 `~/.claude/task-handoff`。这是每个用户各自的本地目录。

> 安装后无需改你的 CLAUDE.md;主动触发行为由技能描述驱动。

## 用法

1. 干活到一段落,或说"我准备新开会话" → `/task-handoff:task-save`,把目标/进度/决策/下一步/关键链接写进 `handoff.md`。
2. 新开会话第一句 `/task-handoff:task-resume <任务名>`(或不带参数让它列出进行中任务)→ 读回并复述,从"下一步"直接续,不用重述背景。
3. 整理时用 `/task-handoff:task-manage`。

## 说明

- 数据目录路径用插件 `userConfig` 注入,跨平台可用(不写死任何盘符)。
- 交接文档模板为精简版:任务目标 / 当前进度 / 关键决策 / 下一步 / 关键链接与路径(必填),背景、改动清单、验证方法、未决问题(按需)。
- 删除等不可逆操作前会先展示目标并请你确认。

## 许可

自由使用与修改。
