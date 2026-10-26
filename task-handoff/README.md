# task-handoff —— 跨会话开发任务接力插件(v2)

把会话状态**外置**成交接文档,让一个长任务可以由**多个 Claude Code 会话接力完成**,中途无需重复描述背景。
v2 的核心承诺:**重要信息一字不丢**——内容只搬不删、状态与历史分层、git 兜底、交接文档可回链到原始会话。

## 它提供什么

三个技能(命名空间前缀 `task-handoff:`):

| 技能 | 作用 |
|------|------|
| `/task-handoff:task-save [任务名]` | **落盘**:状态快照写进 `handoff.md`,本次变动追加到 `log.md`,同步总账 `INDEX.md`,git 自动提交,记录会话 ID。说"准备新开会话/先到这"时也会主动触发。 |
| `/task-handoff:task-resume [序号\|任务名]` | **接力**:新会话里读回 `handoff.md`,机械核对分支/提交/路径是否仍一致,复述确认后从"下一步"继续。不带参数则列出进行中与阻塞任务。 |
| `/task-handoff:task-manage` | **管理**(只能显式调用):删除、改TaskId/重命名/改状态、归档、体检、精简(搬历史到 log)、迁移 v1→v2。 |

## 数据结构

```
<handoff_root>/            自动初始化为 git 仓库,每次 save/manage 提交一次
  INDEX.md                 总账,四区:主表(🔄,序号 1..N)/ ## 阻塞(⬜,B1..)/ ## 已完成(✅,C1..)/ ## 已归档(-)
  <任务名_YYYYMMDD>/
    handoff.md             状态层:目标 / 背景 / 当前状态 / 有效决策 / 改动清单 / 验证 / 下一步 / 未决 / 关键链接,新会话必读
    log.md                 历史层:只追加;从 handoff 搬出的每一条都带原文与原因
  archive/                 归档任务
```

规则:任何内容离开 handoff.md 必须同次以原文进入 log.md;不生成 .bak,回退用 git。所有文档 UTF-8 无 BOM。

## 安装

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install task-handoff@mz-cc-plugins
```

安装时会提示填 **接力文档根目录**(`handoff_root`),例如 `D:/ClaudeTasks` 或默认 `~/.claude/task-handoff`。
依赖:`git`、`python3`(校验脚本只用标准库)。无需改你的 CLAUDE.md。

## 用法

1. 干活到一段落,或说"我准备新开会话" → `/task-handoff:task-save`。
2. 新开会话第一句 `/task-handoff:task-resume 1`(序号)或 `/task-handoff:task-resume <任务名>` → 读回、核对、复述,从"下一步"直接续。
3. 整理时 `/task-handoff:task-manage`。

## 会话回链

每次 save 会把当前会话 ID 写进 handoff 头部 `> 落盘记录:`。下个会话若觉得摘要不够,可 `claude --resume <id>` 打开原会话,或 `claude -p --resume <id> "<问题>"` 向原会话提问。
原始记录受 Claude Code 的 `cleanupPeriodDays`(默认 30 天)约束,需要长期回查可在 `~/.claude/settings.json` 自行调大;handoff + log 仍是唯一不依赖本机状态的长期载体。

## 从 v1 升级

- 什么都不用手改。旧 handoff 可照常 resume;对某任务第一次 save 时自动迁移该任务,或 `/task-handoff:task-manage` 选"handoff 维护 → 迁移"批量迁。
- INDEX 由 v1 六列换成四区七列时,每一行旧"任务"列的原文会先写进该任务 handoff §3 下第一行(`> INDEX 迁移摘要(日期):…`),再拆成任务名 + 一句话状态——旧摘要不丢。
- 每次迁移和每次 save 都跑零丢失校验(旧版本直接取自 git 历史):旧文档每一行都能在新 handoff.md 或 log.md 里逐字找到,否则不落盘。
- 数据根若在别的 git 仓库之内(如 dotfiles),插件会在数据根里另建独立仓库,所有 `git add` 只暂存数据根自身。

## 许可

自由使用与修改。
