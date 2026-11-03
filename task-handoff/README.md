# task-handoff —— 跨会话开发任务接力插件(v2.1)

把会话状态**外置**成交接文档,让一个长任务可以由**多个 Codex / Claude Code 会话接力完成**,中途无需重复描述背景。
v2 的核心承诺:**重要信息一字不丢**——内容只搬不删、状态与历史分层、git 兜底、交接文档可回链到原始会话。

## 它提供什么

三个技能(命名空间前缀 `task-handoff:`)。下表为 Claude 斜杠命令；Codex 可直接说“使用 task-handoff 的 task-save 保存当前任务”等明确请求。

| 技能 | 作用 |
|------|------|
| `/task-handoff:task-save [任务名]` | **落盘**:状态快照写进 `handoff.md`,本次变动追加到 `log.md`,同步总账 `INDEX.md`,git 自动提交,记录会话 ID。用户表达任务交接意图时也可触发；仅结束聊天不自动保存。 |
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

## 安装与配置

Claude Code：

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install task-handoff@mz-cc-plugins
```

Codex（支持 plugin 子命令的版本）：

```
codex plugin marketplace add GoodDream0303/mz-cc-plugins
codex plugin add task-handoff@mz-cc-plugins
```

以上远程安装命令要求适配后的版本已发布到市场。修改本地开发目录不会自动更新已安装缓存，更新后应新开会话验证加载的版本。

依赖：Git、Python 3.8+，运行脚本只用标准库。保留 `.claude-plugin/plugin.json` 供现有市场分发；Codex 的三个技能共用同一份实现，task-manage 另有 `agents/openai.yaml` 保持只能显式调用。

Codex 首次调用 save/resume/manage 时，如果尚未指定或保存交接目录，会询问目录放在哪里。用户选择后保存到 `$CODEX_HOME/task-handoff-config.json`（未设 CODEX_HOME 则 `~/.codex/task-handoff-config.json`），以后新会话直接读取，插件升级也保留配置。

目录优先级：本次明确指定的目录 → `TASK_HANDOFF_ROOT` → 已保存配置。首次没有配置时必须询问，不再静默选用默认目录。配置只保存 `handoff_root`，不写入任务内容。

如果已有 Claude 交接目录，可以在首次询问时选择同一路径。Claude 继续使用原安装流程的 `handoff_root` 配置及技能正文插值；Codex 的首次询问发生在技能调用时，而不是 `codex plugin add` 安装时。

临时测试可直接在请求中指定测试目录，不影响已保存的正式目录。明确更改默认目录时，技能在确认后用 `--save-root` 更新配置。普通运行环境解析保持只读；只有此选项会写插件配置，不会创建或搬迁任务数据。详细规则见 [运行环境说明](references/runtime.md)。

## 用法

1. 干活到一段落,或说"我准备新开会话" → `/task-handoff:task-save`。
2. 新开会话第一句 `/task-handoff:task-resume 1`(序号)或 `/task-handoff:task-resume <任务名>` → 读回、核对、复述,从"下一步"直接续。
3. 整理时 `/task-handoff:task-manage`。

Codex 和 Claude Code 下，save 保存交接文档后、resume 定位任务并复述时，都会提醒手动为当前会话改名，并提供已填入实际任务名的完整 `/rename` 命令，方便复制到当前宿主的输入框执行。例如任务名为“会话接力机制与插件分发”时：

```text
/rename 会话接力机制与插件分发
```

此提醒不自动修改会话标题，也不要求先完成改名才能继续。

## 会话回链

每次 save 在 `> 落盘记录:` 中写入来源和 ID，例如 `session codex:<id>` 或 `session claude:<id>`。

- Codex 记录使用 `codex resume <id>` 打开原会话。
- Claude 记录使用 `claude --resume <id>` 打开原会话。
- 无法获取 ID 时记录 `<宿主>:unknown`，不生成无效回链。
- 旧记录原文保留；无法确定来源时不猜测恢复命令。

两端可以通过共享的 handoff/log 接续工作，原会话恢复则必须使用记录所属宿主。恢复命令供用户手动执行。原始会话是否仍在本机可用取决于宿主，handoff + log 是长期交接依据。

## 开发验证

在市场仓库根目录运行：

```text
python -B -m unittest discover -s task-handoff/scripts -p "test_*.py"
python -I task-handoff/scripts/handoff_runtime.py --host codex
```

测试覆盖首次无配置提示、新进程复用配置、临时目录不覆盖正式配置、无效配置报错、两端会话来源、Claude 真实子进程变量和三个技能入口的配置插值传参（模拟宿主渲染）、数据目录优先级、缺失 ID、未展开配置拒绝、只读解析、中文空格路径，以及原有章节/总账/零丢失校验。测试使用临时目录，不改真实任务数据。

## 从 v1 升级

- 什么都不用手改。旧 handoff 可照常 resume;对某任务第一次 save 时自动迁移该任务,或 `/task-handoff:task-manage` 选"handoff 维护 → 迁移"批量迁。
- INDEX 由 v1 六列换成四区七列时,每一行旧"任务"列的原文会先写进该任务 handoff §3 下第一行(`> INDEX 迁移摘要(日期):…`),再拆成任务名 + 一句话状态——旧摘要不丢。
- 每次迁移和每次 save 都跑零丢失校验(旧版本直接取自 git 历史):旧文档每一行都能在新 handoff.md 或 log.md 里逐字找到,否则不落盘。
- 数据根若在别的 git 仓库之内(如 dotfiles),插件会在数据根里另建独立仓库,所有 `git add` 只暂存数据根自身。

## 许可

自由使用与修改。
