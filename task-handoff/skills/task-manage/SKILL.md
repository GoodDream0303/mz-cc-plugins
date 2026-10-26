---
name: task-manage
description: 管理接力任务——删除任务、改TaskId/重命名/改状态、归档已完成、清理体检 INDEX 一致性、精简 handoff(把历史搬到 log.md)、迁移 v1 格式到 v2。当用户要清理、删除、重命名、归档接力任务,整理 INDEX 总账,或精简/迁移某个 handoff 时使用。
disable-model-invocation: true
---

# task-manage — 接力任务管理(v2)

数据根:`${user_config.handoff_root}`(下文 `<root>` 即指它),总账 `${user_config.handoff_root}/INDEX.md`。
校验脚本:`${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py`。本会话 ID:`${CLAUDE_SESSION_ID}`。
所有 md 一律 UTF-8 无 BOM、LF。文件系统操作(移动 / 重命名 / 删除)用 shell;改 INDEX / handoff 内容用 Edit。
**不生成 .bak**。每个操作结束 git 提交一次:
```
git -C "<root>" add -A -- .
git -C "<root>" commit -m "manage: <操作> <任务名>"
```
提交信息不加署名行。**所有 `git add` 一律带 `-- .`**。操作前先确认数据根是**独立**仓库:`git -C "<root>" rev-parse --show-toplevel` 必须等于 `<root>`;为空或指向上层目录(数据根嵌在 dotfiles 等别的仓库里)→ `git -C "<root>" init && git -C "<root>" add -A -- . && git -C "<root>" commit -m "init: task-handoff v2 数据根入库"` 并告知用户,绝不把上层仓库当数据根。
六类操作:**删除 / 改TaskId·重命名·改状态 / 归档 / 体检 / 精简 / 迁移**。

## INDEX 四区(所有操作共同遵守)

表头统一 `| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |`。

| 区 | 标题 | 状态 | 序号 |
|---|---|---|---|
| 主表 | 文件顶部表格 | 🔄进行中 | `1..N` 连续 |
| 阻塞 | `## 阻塞` | ⬜阻塞 | `B1..Bm` 连续 |
| 已完成 | `## 已完成` | ✅已完成,文件夹留原地 | `C1..Ck` 连续 |
| 已归档 | `## 已归档` | 已搬 archive/ | `-` |

任何状态变化 = 原区删行 + 原区重排 + 目标区追加 `max+1`;分区不存在则新建带表头。任务名 ≤30 字,一句话状态 ≤60 字,⬜ 行必须写阻塞原因。

## 派发

先 Read INDEX。意图已明确(含操作 + 目标任务)→ 直接执行对应小节。
意图不明 → **先用纯文本列四区全部任务**(序号 / 任务名 / 状态 / 一句话状态 / 最近更新,不省略),再 AskUserQuestion 两题同屏(各 `multiSelect=false`),**不要自己猜**:
1. 「任务」:主表 + 阻塞区按最近更新倒序取至多 4 个作选项(label 任务名,description 状态 + 最近更新);其余靠 Other 手输。
2. 「操作」固定 4 项:**删除任务** → §1;**改TaskId / 重命名 / 改状态** → §2;**整理 INDEX(归档 + 体检)** → §3 与/或 §4(按现状判断:已完成区有任务则可归档,有不一致则体检;都适用就都做);**handoff 维护(精简 / 迁移)** → 目标仍是 v1 格式则 §6,否则 §5。

「整理 INDEX」不针对单个任务,此时忽略问题一的选择。

## 1. 删除任务(不可逆)

1. INDEX 定位文件夹。
2. **删除前先看目标**:Read 其 handoff.md,把任务名 / 状态 / 下一步摘要给用户,明确告知将**递归删除整个文件夹**(连同所有产物),请确认。
3. 确认后删除(PowerShell `Remove-Item '<绝对路径>' -Recurse -Force`;类 Unix `rm -rf '<绝对路径>'`)。
4. Edit 删 INDEX 行,所在区重排序号(主表 `1..N` / 阻塞 `B1..Bm` / 已完成 `C1..Ck`)。
5. git 提交;回显已删文件夹与行,并说明 git 历史仍可找回(`git -C "<root>" log --diff-filter=D --name-only`)。

> 用户只想删 INDEX 行、保留文件夹(或反之),按其明确意思来,不扩大范围。

## 2. 改TaskId / 重命名 / 改状态

可单项或组合。三处同步:文件夹名(仅重命名)、INDEX 行、handoff 头部。
- **改 TaskId**:Edit handoff 标题行 `TaskId:` 与 INDEX TaskId 列。改的是任务单号,不是最左"序号"列。
- **改状态**:Edit handoff `> 状态` 行;INDEX 按四区流转(原区删行重排、目标区追加)。改为 ⬜ 时**必须**向用户要阻塞原因,写入 handoff `> 阻塞:<原因;解除条件;等谁>` 行(紧跟 `> 状态` 行)和 INDEX 一句话状态;从 ⬜ 改走时删 `> 阻塞:` 行。刷新"最近更新"。
- **重命名**:文件夹名 `简明任务名_YYYYMMDD` 只换名字部分、保留日期;`Rename-Item '<旧绝对路径>' '<新文件夹名>'` / `mv`;Edit INDEX 任务名列与文件夹列(`<新文件夹名>/handoff.md`);Edit handoff 标题行任务名;`log.md` 首行标题同步。
- 改完跑 `python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" index "<root>"`,无 ERROR 后 git 提交;回显改了哪些字段、涉及哪些文件。

## 3. 归档(已完成区 → archive/)

1. 确保 `${user_config.handoff_root}/archive/` 存在(无则新建)。
2. 文件夹 `Move-Item` / `mv` 进 `archive/`。
3. Edit INDEX:行从 `## 已完成` 移到文件末尾 `## 已归档`(无则新建带表头),文件夹列改 `archive/<文件夹名>/handoff.md`,序号置 `-`。
4. `## 已完成` 区剩余重排 `C1..Ck`。
5. 兼容兜底:旧数据里 ✅ 仍在主表 / 阻塞区的,先按 §2 规则并入已完成区,再归档。
6. 可一次多个;跑 `index` 校验无 ERROR;git 提交;回显。

## 4. 体检

1. 删掉 INDEX 里带 `<示例>` 字样的行。
2. 跑 `python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" index "<root>"`,它报告:孤儿行(INDEX 有、磁盘无)/ 漏登记(磁盘有 handoff.md、INDEX 无行)/ 四区序号断裂 / 状态与所在区不符 / 表头不符 / 任务名或一句话状态超长 / ⬜ 无阻塞原因 / 文件夹列格式错;`WARN`:残留 `.bak`、缺 `log.md`(v1 任务)。
3. 只**报告**并给修复建议(补行 / 删孤儿行 / 修路径 / 重排 / 补阻塞原因 / 删 .bak / 迁移);**经用户确认后**再改;改完重跑直到无 ERROR,git 提交。

## 5. 精简 handoff(把历史搬到 log.md,不删)

针对仍在进行的 **v2** 任务。把 handoff 里已完成 / 已被取代 / 已失效 / 冗余的内容搬到 log.md,让状态层回到"只看现在与下一步"。不改任务状态。
1. **通读**:Read handoff.md 全文。
2. **只读分类**:
   - **确证失效**:§9 本地路径用 `Test-Path` 查;引用的已删除仓库 / 文件夹标失效。URL **不联网**,只按上下文判断,标"疑似"。
   - **文档内可推断的过期**:§7 里已在 §3 标完成的;§8 里正文别处已解决的;§4 里被后续决策取代的;逐字重复。
   - **§3 里的历史流水**:描述过程而非现状的条目。
3. **产出报告**:逐项 `[区块 | 原文 | 处置(搬 log / 标注 / 保留待定) | 理由 | 置信度]`。决策类、存疑链接默认**保留**并标"需你判断"。
4. **逐项 / 批量确认**:用户勾选采纳哪些;**未确认的绝不动**。
5. **应用**:log.md 末尾追加 `## YYYY-MM-DD  精简(session ${CLAUDE_SESSION_ID})`,"从 handoff 搬出"逐条**原文** + 原因;handoff 对应处删除或标注;刷新头部"最近更新";跑 `sections` 校验,再跑零丢失兜底 `python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" zero-loss git:HEAD "<handoff.md>" "<log.md>"`,报"丢失行"就把原文补进 log,直到通过。
6. git 提交;回显改了什么,提示可用 `git -C "<root>" checkout HEAD~1 -- "<文件>"` 回退。

> 红线:任务目标、仍有效的决策、仍有效的下一步与关键链接一律保留;每处删改都经用户点头。

## 6. 迁移 v1 → v2

可一次多个。对每个任务(与 task-save 内嵌迁移规则一致):
1. 对照副本不落文件:确认 v1 版本已在 git HEAD 里(数据根刚 init 时 init 提交即含它),零丢失校验用 `git:HEAD` 取旧版本。
2. 新建 `log.md`(标题 `# <任务名> 历史日志`,次行 `> 只追加,不删改既有条目。`),首条 `## YYYY-MM-DD  迁移自 v1(session ${CLAUDE_SESSION_ID})`。
3. 九节补齐、按序:`## 3. 当前进度` → `## 3. 当前状态`,`## 4. 关键决策与权衡` → `## 4. 有效决策`;缺的写"无";非模板标题整体移到 §9 之后作附录,不删;标题后原有说明文字保留。
4. §3 已完成的历史条目、§7 已完成条目、§8 已解决条目、§4 被取代决策 → **原文**搬到迁移条目"从 handoff 搬出",带原因。拿不准的留原处。
5. 头部加 `> 落盘记录:YYYY-MM-DD session ${CLAUDE_SESSION_ID}(迁移)`;⬜ 任务补 `> 阻塞:` 行(原因从正文取,取不到问用户)。TaskId / 分支 / 关键路径的值原样保留。
6. 校验:`python -I "${CLAUDE_PLUGIN_ROOT}/scripts/handoff_check.py" zero-loss git:HEAD "<handoff.md>" "<log.md>"` 与 `sections "<handoff.md>"`。不过则修到过。
7. 删该目录下 `*.bak`(git 历史已有)。
8. INDEX 若仍是 v1 六列(表头 `序号 | 任务 | 状态 | TaskId | 文件夹 | 最近更新`):先对**每一行**(含已完成区)把其"任务"列原文插到该任务 handoff `## 3.` 标题下第一行 `> INDEX 迁移摘要(YYYY-MM-DD):<原文>`(handoff 还是 v1 也照插),任务名取简名 ≤30 字、一句话状态压 ≤60 字,再换成四区七列(🔄 主表 `1..N` / ⬜ `## 阻塞` `B1..` / ✅ `## 已完成` `C1..`)。没做回填不得改表头。
9. git 提交;回显。
