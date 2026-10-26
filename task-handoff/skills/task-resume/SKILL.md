---
name: task-resume
description: 在干净的新会话里读回某个开发任务的交接文档(handoff.md 状态层)并接续工作,读前机械核对分支/提交/路径是否仍与文档一致。当用户要继续/恢复某个之前的任务、或开场就提到接着上次干时使用。只读精炼状态层,不拉旧对话长历史;历史层 log.md 按需再读。
argument-hint: [序号|任务名]
---

# task-resume — 会话接力(v2)

数据根:`${user_config.handoff_root}`,总账 `${user_config.handoff_root}/INDEX.md`。
校验脚本:`${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py`。
要接力的任务:`$ARGUMENTS`;为空进入"列表挑选"。
本技能**只读**:不写任何文件、不改任何仓库状态、不 fetch。

## 执行步骤

1. **读总账**:Read `${user_config.handoff_root}/INDEX.md`。

2. **`$ARGUMENTS` 为空**:列出**主表**(🔄)和 **`## 阻塞`** 区(⬜)全部任务的简表:序号、任务名、状态、一句话状态、最近更新,序号原样(主表数字、阻塞区 B 前缀)。不列已完成;用户要回看可报 `C` 序号。请用户指明接力哪一个(序号或任务名)。**不要自动选**,停在这里等回复。

3. **定位**:
   - 纯数字 → 主表;`B` 前缀 → `## 阻塞` 区;`C` 前缀 → `## 已完成` 区。
   - 任务名 → 四区模糊匹配;命中多个或零个 → 列候选让用户选,不猜。

4. **读状态层**:Read 该文件夹的 `handoff.md`。**不读 `log.md`**,只在复述里说明它存在、需要追溯时再读。
   先跑 `python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" sections "<handoff.md>"`:不通过或没有 `log.md` → 仍是 v1 格式,照常读,复述时提示"下次 save 会自动迁移,或用 task-manage §6 主动迁移"。

5. **机械核对**(只读):从头部 `> 分支` / `> 关键路径`、§5、§9 抽取能验证的事实,逐项验证。工程根取自 `> 关键路径`;取不到就说明并跳过核对。
   - 分支存在?`git -C "<工程根>" branch --list "<名>"`;远端有?`git -C "<工程根>" branch -r --list "*/<名>"`
   - 提交存在?`git -C "<工程根>" cat-file -t <hash>`;已在远端?`git -C "<工程根>" branch -r --contains <hash>`(不 fetch,以本地远端跟踪为准,结论里注明)
   - 本地路径存在?PowerShell `Test-Path "<路径>"`(类 Unix `test -e`)
   输出核对表 `项 | 文档说法 | 实际 | 结论`,不符项单独列出。

6. **⬜ 任务**:先核对头部 `> 阻塞:` 写的解除条件是否已满足(能验证的验证,不能的问用户),再决定继续或仍等。

7. **复述确认**,三五句话:任务目标 / 当前状态 / 下一步 / 未决问题 / 核对不符项 / 最近一次落盘的会话 ID(头部 `> 落盘记录:` 首条)。
   回查原文的方式一并给出:`claude --resume <id>` 打开原会话;`claude -p --resume <id> "<问题>"` 向原会话提问。原始记录受 settings `cleanupPeriodDays`(默认 30 天)约束,过期则回链失效,以 handoff + log 为准。
   请用户确认理解一致;若有核对不符项或未决问题,一并提出。

8. **接续**:确认后从 §7 下一步开始干活,不要求用户重述背景。过程中遵循 §2 / §4 / §9 记录的约束、决策与路径。

> 提示:本会话结束或用户说"准备新开会话"时,用 task-save(`/task-handoff:task-save`)回写,完成接力闭环。
