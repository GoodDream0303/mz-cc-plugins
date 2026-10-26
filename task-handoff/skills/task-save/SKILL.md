---
name: task-save
description: 落盘当前会话进展到任务交接文档(handoff.md 状态层 + log.md 历史层)并更新总账 INDEX.md,只搬不删、git 自动提交、记录会话 ID。当用户表达"准备新开会话/先到这/换个会话继续/收尾"等语义,或显式要求保存进度时使用。让长任务可跨会话接力,下个会话无需重述背景。
argument-hint: [任务名]
---

# task-save — 会话落盘(v2)

把当前会话的进展写成两层文档:`handoff.md` 是**状态层**(新会话必读,描述"现在是什么样"),
`log.md` 是**历史层**(只追加,记录"怎么来的")。同步根目录 `INDEX.md` 总账,最后 git 提交。
目的:下一个会话用 task-resume 无损接力,**重要信息一字不丢**。

数据根:`${user_config.handoff_root}`(下文 `<root>` 即指它)。总账 `${user_config.handoff_root}/INDEX.md`。
本会话 ID:`${CLAUDE_SESSION_ID}`。校验脚本:`${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py`。
任务名:`$ARGUMENTS`;为空则按第 1 步判定。

## 铁律

1. **编码**:数据根下所有 `.md` 一律 UTF-8 无 BOM、LF。优先用 Write/Edit 工具;若用 PowerShell 须 `-Encoding utf8` 且不引入 BOM。
2. **只搬不删**:任何内容离开 handoff.md,必须在同一次 save 的 log.md 条目里以**原文**出现并注明原因。唯一允许直接删除的是逐字重复。有疑问就留在 handoff,不替用户拿主意。
3. **不生成 .bak**:回退靠 git(`git -C "<root>" log -- <文件>` 找版本,`git -C "<root>" checkout <hash> -- <文件>`)。

## 执行步骤

### 1. 判定当前任务
- 本会话此前已用 task-resume 接力过某任务 → 就是它。
- 否则 `$ARGUMENTS` 非空 → 用它。
- 否则向用户确认任务名(可据当前 git 分支名推断)。

### 2. 确保数据根是 git 仓库
`git -C "<root>" rev-parse --is-inside-work-tree`;失败则:
```
git -C "<root>" init
git -C "<root>" add -A
git -C "<root>" commit -m "init: task-handoff v2 数据根入库"
```
并在回显里告知用户"数据根已初始化为 git 仓库"。若 `git` 不可用,记下警告,后续步骤照做,仅跳过提交。
若 `git config user.name` 为空,仅对本仓库设:`git -C "<root>" config user.name task-handoff` 与 `git -C "<root>" config user.email task-handoff@local`。

### 3. 定位/新建任务文件夹
- Read `INDEX.md`,查该任务是否已有行(四区都查:主表 / `## 阻塞` / `## 已完成` / `## 已归档`)。
- 有 → 复用其文件夹。无 → 新建 `<简明任务名>_<YYYYMMDD>`(今天日期,下划线不留空格),按下方「模板」新建 `handoff.md` 与 `log.md`。
- 已有文件夹但**无 `log.md`,或 `python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" sections "<handoff.md>"` 不通过** → 先按文末「迁移 v1 → v2」做迁移,再继续。

### 4. 更新 handoff.md(状态层)
- **§3 当前状态**:整体重写成快照——用现在时描述"现在是什么样",每条一行,不写日期流水。重写时被去掉的原条目 → 本次 log 的"从 handoff 搬出"。
- **§4 有效决策**:仍成立的留;被取代的搬 log,此处可留一行"已被 <新决策> 取代,见 log YYYY-MM-DD"。
- **§7 下一步**:重写为"新会话第一件事",越具体越好。已完成的条目搬 log。
- **§8 未决问题**:已解决的搬 log。
- **§9 关键链接与路径**:回看整段对话,把用户提到过的网址 / 工程路径 / 参考文件 / 命令 / 关键标识符**逐字**补齐(不改写、不省略路径层级);确证失效的搬 log 并注明。
- **§5 改动清单**:补本次涉及文件、提交号、分支。
- **头部**:刷新"最近更新";据实更新状态;`> 落盘记录:` 行前置本次 `YYYY-MM-DD session ${CLAUDE_SESSION_ID}`,只留最近 3 条(全量在 log.md);状态为 ⬜阻塞 时必须有 `> 阻塞:<原因;解除条件;等谁>` 行,其它状态删该行。
- 九节必须齐全、按 1~9 顺序,无内容写"无"。非模板标题只允许出现在 §9 之后(附录)。
- 写完跑:`python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" sections "<handoff.md>"`,不过则修到过。

### 5. 追加 log.md(历史层)
在文件末尾追加一条:
```markdown
## YYYY-MM-DD  session <会话ID>
- 本次完成:...
- 决策变更:原 <X> → 现 <Y>,原因 ...
- 从 handoff 搬出:
  - [§3] <原文>(原因:已完成,结论已并入 §3)
  - [§4] <原文>(原因:已被 <Y> 取代)
  - [§8] <原文>(原因:已解决)
  - [§9] <原文>(原因:路径已失效)
```
没有搬出项就写 `- 从 handoff 搬出:无`。搬出条目**按原文**,不改写。

### 6. 更新 INDEX.md
四区表头统一:`| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |`
- **主表**(文件顶部表格)收 🔄进行中,序号 `1..N`;**`## 阻塞`** 收 ⬜阻塞,序号 `B1..Bm`;**`## 已完成`** 收 ✅已完成,序号 `C1..Ck`;**`## 已归档`** 序号 `-`(仅 task-manage 维护)。
- 任务名 ≤30 字只放名字;一句话状态 ≤60 字;⬜ 行一句话状态必须是阻塞原因;TaskId 无则"无";文件夹列 `<文件夹>/handoff.md`。
- 状态未变 → 原地更新"一句话状态"与"最近更新"。
- 状态变了 → 从原区删行、原区重排序号、追加到目标区取该区 `max+1`。分区不存在则新建带表头。
- INDEX 不存在 → 按主表表头新建。
- 写完跑:`python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" index "<root>"`,有 ERROR 则修到无。

### 7. git 提交
```
git -C "<root>" add -A
git -C "<root>" commit -m "save: <任务名> YYYY-MM-DD"
```
提交信息不加任何署名行。失败不阻断,回显警告。

### 8. 回显
- handoff.md 完整路径;本次搬到 log 的条目逐条列出;INDEX 变动(分区 / 序号);git 提交号。
- §3 超过 40 行 → 提醒"可用 task-manage §5 把历史搬到 log.md"。
- 提示下次新会话用 `/task-handoff:task-resume <序号或任务名>` 接力。

## 模板

handoff.md:
```markdown
# <任务名> | TaskId:<单号或"无"> | 分类:<可选>
> 状态:🔄进行中
> 创建:YYYY-MM-DD   最近更新:YYYY-MM-DD
> 分支:<git 分支名,可选>
> 关键路径:<工程根 / SDK / 主要源码,可选>
> 落盘记录:YYYY-MM-DD session <id>

## 1. 任务目标
为什么做、做成什么算成功。
## 2. 背景与约束
平台 / 编码 / 已知坑,一次写清。
## 3. 当前状态
快照:现在是什么样,每条一行,不写日期流水。
## 4. 有效决策
仍然成立的决策与理由。
## 5. 改动清单
涉及文件、提交号、分支。
## 6. 验证方法
跑什么、通过标准。
## 7. 下一步
新会话第一件事做什么。
## 8. 未决问题
仍未决的问题与备忘。
## 9. 关键链接与路径
网址 / 工程路径 / 参考文件 / 命令 / 关键标识符,逐字。
```
状态为 ⬜阻塞 时,在 `> 状态` 行下加 `> 阻塞:<原因;解除条件;等谁>`。

log.md:
```markdown
# <任务名> 历史日志
> 只追加,不删改既有条目。
```

## 迁移 v1 → v2(handoff 已存在但非 v2 时,save 内嵌执行)
1. `copy "<handoff.md>" "<同目录>/handoff.v1.tmp"` 留作校验对照。
2. 新建 `log.md`(标题 `# <任务名> 历史日志`),首条 `## YYYY-MM-DD  迁移自 v1(session ${CLAUDE_SESSION_ID})`。
3. 九节补齐、按序:`## 3. 当前进度` 改 `## 3. 当前状态`,`## 4. 关键决策与权衡` 改 `## 4. 有效决策`;缺的节写"无";非模板标题整体移到 §9 之后作附录,不删。标题后原有的说明文字保留。
4. §3 里已完成的历史条目、§7 里已完成条目、§8 里已解决条目、§4 里被取代决策 → 按原文搬到迁移条目的"从 handoff 搬出"。拿不准的留在原处。
5. 头部加 `> 落盘记录:` 行;⬜ 任务补 `> 阻塞:` 行(原因从正文取,取不到问用户)。TaskId / 分支 / 关键路径的值原样保留。
6. 校验:`python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" zero-loss "<handoff.v1.tmp>" "<handoff.md>" "<log.md>"` 与 `sections "<handoff.md>"`。不通过则修到通过;通过后删 `handoff.v1.tmp`。
7. 该任务目录下 `*.bak` 删除(git 历史已有)。
