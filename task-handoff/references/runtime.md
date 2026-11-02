# 运行环境（Codex / Claude Code）

三个技能执行前均读取本文件。Claude 的数据目录和会话 ID 继续从各 SKILL.md 正文中的宿主插值入口取得；本参考文件不参与宿主插值。Codex 使用独立分支，其他路径占位符由 agent 用真实值替换。

## 初始化与首次配置

1. 从当前加载的 `skills/<技能>/SKILL.md` 所在目录向上两级得到插件根目录。使用该根目录的 `scripts/handoff_runtime.py`，不要依赖工作目录或 `CLAUDE_PLUGIN_ROOT`。
2. 根据当前宿主显式传 `--host codex` 或 `--host claude`，不要因环境中残留另一个宿主的变量而切换。
3. 确定数据目录：本会话已确定的任务数据根或用户指定路径优先；其次检查 `TASK_HANDOFF_ROOT`。未设置上述值时，Claude 使用当前 SKILL.md 的“Claude 数据根”已渲染值，作为 `--root` 参数；这是原版 `handoff_root` 配置的传递入口。Claude 配置仍是字面占位符时，询问实际数据根，不静默切换默认目录。Codex 忽略 Claude 插值项，未指定根目录时读取已保存的 Codex 插件配置；没有配置则进入下述首次询问流程。
4. Codex 执行 `python -I "<插件根>/scripts/handoff_runtime.py" --host codex [--root "<实际数据根>"]`。Claude 使用 `--host claude`，按第 3 步传数据根，并将 SKILL.md 中“Claude 会话 ID”的已渲染真实值通过 `--session-id "<真实ID>"` 传入。若该 ID 未渲染则省略 `--session-id`，脚本从真实子进程变量 `CLAUDE_CODE_SESSION_ID` 读取。方括号不是命令字面量；Python 命令按本机可用的 Python 3.8+ 选择。路径及 ID 均按当前 shell 正确引用，不直接拼接未经引用的配置值。
5. 先检查输出 JSON 的 `needs_setup`：若为 true，先完成下述首次配置，不得访问 null 路径或擅自使用默认目录。然后读取输出 JSON：`root` → `<root>`；`index` → 总账；`check_script` → `<check_script>`；`session_ref` → `<session_ref>`。后续命令替换为这些真实值，并按当前 shell 正确引用路径。

### Codex 首次询问并保存配置

- 没有本次显式目录、TASK_HANDOFF_ROOT 或已保存配置时，脚本返回 `needs_setup: true`，`root` / `index` 为 null，且不写任何文件。此时先问用户“交接目录放在哪里？”，等待明确选择后继续。
- 如果上下文已有正式目录，或用户说原来在 Claude 使用过，可只读检查 `~/.claude/settings.json` 的 `pluginConfigs["task-handoff@mz-cc-plugins"].options.handoff_root`，将现有目录作为建议选项；未经确认不自动迁移或采用。没有线索时允许用户输入路径，可建议 `~/.codex/task-handoff`，但不能代替用户选择。
- 用户确认正式默认目录后，运行 `python -I "<插件根>/scripts/handoff_runtime.py" --host codex --root "<已确认目录>" --save-root`。只保存路径配置，不创建、移动或修改交接数据。
- 配置保存在输出 `config_path` 指向的 `$CODEX_HOME/task-handoff-config.json`；未设 CODEX_HOME 则为 `~/.codex/task-handoff-config.json`。文件只有 `handoff_root` 字段，不放在插件版本缓存中，升级后仍然生效。
- 后续会话直接读取该配置，不重复询问。用户明确要求更改默认目录时，再使用 --save-root 保存新选择。保存路径不存在或不可访问时报告问题，不静默换目录。
- 用户已明确指定本次数据目录（特别是测试目录）时，普通 --root 只临时覆盖，不写配置、不触发额外默认目录确认。TASK_HANDOFF_ROOT 也只覆盖本次进程环境，不重写持久配置。
- 普通解析的优先级：本次 --root → TASK_HANDOFF_ROOT → Codex 已保存配置；全部缺失时询问。Claude 继续由原宿主安装配置和技能正文插值提供目录，不使用 Codex 配置文件。

普通解析仍为只读，不执行 Git。只有用户确认后使用 --save-root 才写入插件配置。Codex 安装命令本身不弹出本技能的询问，初始化在首次调用 save/resume/manage 时执行。resume 在已配置后保持只读；首次配置需先完成用户确认，不应声称配置过程完全无文件写入。

两端可明确选择同一个数据根共享已有任务，不自动搬迁或合并。resume/manage 的数据目录或 INDEX 不存在时只报告并请用户指定位置；save 在已授权保存的范围内创建所需目录。

## 会话来源与恢复

- Codex 读取 `CODEX_THREAD_ID`；Claude 优先使用技能正文 `${CLAUDE_SESSION_ID}` 已渲染后传入的 `--session-id`，未传时读取子进程环境变量 `CLAUDE_CODE_SESSION_ID`（两种机制不同），写入格式为 `session codex:<id>` 或 `session claude:<id>`。ID 不可得时写 `codex:unknown` / `claude:unknown` 并说明无法提供原会话回链，不猜测或搜索“最近一个”会话替代。
- 读旧记录时保留原文，不回填猜测的来源。无前缀的历史 ID 仅在有证据确定宿主时提供恢复命令，否则说明来源未知。
- 对 `codex:<id>` 给出 `codex resume <id>`；对 `claude:<id>` 给出 `claude --resume <id>`。恢复命令使用原宿主，即使当前任务正在另一宿主接力。`unknown` 不生成恢复命令。
- 回链命令供用户执行，不自动启动另一个交互会话。会话记录是否仍可用取决于原宿主和本机数据；不把 Claude 的清理配置套用到 Codex。`handoff.md` / `log.md` 是持久交接依据。

## 工具与授权

- `Read` / `Write` / `Edit` 表示读写操作：Codex 使用当前可用的文件读取、`apply_patch` 或 shell；Claude 可使用同名工具。禁止调用当前环境不存在的工具。
- `$ARGUMENTS` 表示用户明确提供的任务名或序号；宿主不注入参数时从用户请求中提取，不把占位符当任务名。
- 需要用户选择或确认时，使用当前可用且允许调用的提问工具；没有则用普通回复提问并等待。选项数量按工具限制拆分，不依赖 `AskUserQuestion` 的专用参数。
- 只在用户要求保存/接续/管理任务的范围内操作交接文档。仅讨论插件或泛泛结束聊天不构成保存授权；遵守全局指令中的自动记忆确认规则。
- Markdown 写入使用 UTF-8 无 BOM、LF。PowerShell 5 的 `-Encoding utf8` 会带 BOM，应改用 Python 或明确的无 BOM 写法。
- 删除或移动前解析并核对绝对路径位于数据根内，不能删除数据根本身；Windows 使用 `-LiteralPath`，不跨 shell 拼接删除命令。
