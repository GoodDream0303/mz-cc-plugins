# Codex HUD 设计：Windows Terminal 多行面板

日期：2026-11-02。状态：独立 builder check 已通过，用户已在本会话批准实现。

## 1. 用户目标与已确认范围

为原生 Windows Terminal 中的 Codex CLI 开发独立 HUD，参考本机 claude-hud 0.8.0 的显示和配置习惯。信息应多行常驻，项目增多或窗口缩窄时仍可阅读。配置必须可选择、可保存、可导入，不能把本机偏好硬编码成唯一布局。

用户已选择 Windows Terminal 方案，并明确本次不考虑 claude-scope。现有 claude-scope 和 task-handoff 的代码、行为、Claude marketplace 注册与配置不变。本次不是 OMX、多代理编排框架或任务接力工具。

工作仓库：`E:/Ai_Process_Folder/mz-cc-plugins`。计划新增 `codex-hud/` 和独立的 Codex marketplace 元数据，继续在同仓维护；不得把 Codex 插件加入现有 Claude marketplace。

## 2. 已核对的本机事实

- Claude 启动入口在 `C:/Users/mzzhu2/.claude/settings.json` 的 `statusLine.command`；真正的 HUD 显示配置在 `~/.claude/plugins/claude-hud/config.json`。
- 用户使用展开布局；显示模型、项目、上下文、Token 明细、额度、推理强度、会话 Token、MCP、agents、todos；关闭工具活动、Skills、费用、速度、时长、内存；Git 只显示分支。周额度阈值为 0，始终显示。
- Claude 启动命令根据终端宽度预留 4 列，说明窄窗口适配很重要。
- Windows Terminal、Node.js、Python、Git 均已安装。安装的 Codex npm 包版本为 0.166.0。
- 本地 Codex JSONL 已确认包含 `turn_context`、`event_msg/token_count`、工具事件、`token_usage_record`。能取得模型、effort、上下文窗口、最新用量、会话累计用量、额度窗口和重置时间。
- 观察到的额度样本只有一个 10080 分钟窗口。必须根据实际窗口信息标注，不能默认 primary 就是 5 小时。
- 仓库原有未跟踪项 `task-handoff/scripts/__pycache__/` 属于已有状态，不清理、不暂存。

## 3. 方案与实施选择

已选的产品方案是 Windows Terminal 上下分屏：上方运行原版 Codex，下方运行独立 HUD。悬浮窗按用户要求排除；修改/编译定制 Codex 二进制不在本次范围。

代码实现由构建者选择，本文建议：Node.js 20+、TypeScript、少量独立模块；参考并适当复用 claude-hud 的 MIT 配置校验、颜色和宽度处理，而非整包带入 Claude 专用逻辑。复用代码保留原版权、MIT 条款及来源说明。Node 依赖使用 lockfile 锁定；需要读 TOML 时选用正规的解析器，不用正则冒充 TOML 解析。

相比直接 fork 一个现成 HUD，本方案更容易精确匹配用户的配置习惯、原生 Windows 和会话绑定要求，但要自行验证 Codex 数据适配与 Terminal 生命周期。

## 4. 产品入口与窗口行为

提供独立 CLI 和 Codex 插件启动技能，名称暂定 `mz-codex-hud`，目录为 `codex-hud/`。

- `start [-- <Codex arguments...>]`：创建一个独占名称的 Windows Terminal 窗口，批量创建上方 Codex 与下方 HUD，最后将焦点交回 Codex。每次启动均有独立 launch ID，避免同时打开多个项目时共享焦点或数据。新开专属窗口是构建者提出的默认行为，不表示用户已单独要求新窗口。
- `watch --session <id>` / `once --session <id>`：监控或输出指定会话，可在用户自己安排的分屏中使用。
- `list`：列出可选择的会话；不显示或读取消息正文作为标题。
- `configure`：交互配置、预设、开关、布局/顺序、颜色、尺寸、语言；保存前预览，取消不修改配置。
- `config show` / `config set <key> <value>`：便于脚本化调整，使用与菜单相同的校验。
- `import-claude [--path ...]`：读取显示配置，预览差异和不支持项，再确认写入；不读取或搬运 Claude 的 API key、环境变量或认证。
- `doctor`：检查 Codex、Node、Windows Terminal、插件/hook 信任与绑定链路，报告真正缺失的条件；不发起模型请求。
- `stop --launch <id>`：停止自己的 HUD/启动包装器；绝不结束不属于自己的会话。默认手工关闭 Codex 面板后 HUD 正常退出；退出 HUD 不结束 Codex。

下方面板默认占约 22% 高度，允许设置比例和人工拖动分隔线。布局按实际行列数重排；首版不尝试通过未公开 Terminal API 强制自动拖动分隔线。缺少 WT 环境时说明如何手动运行 watch；不擅自改为 WSL、悬浮窗或静默覆盖输入区。

Windows Terminal 没有 Claude Code 的 statusLine 重绘回调，因此这是同一 Terminal 窗口内的独立面板，不伪装成 Codex 原生多行底栏。布局、命名及默认高度要在 Windows Terminal 上实测。

## 5. 会话绑定与生命周期

禁止“始终跟随最新 JSONL”作为启动模式的数据源，否则相同目录的多个会话、子代理及别的窗口会串台。

1. 启动器创建随机 launch ID，写最小运行描述文件；将其路径分别作为参数传给上方 runner 和下方 watcher，而不是假定 Terminal 会继承调用端临时环境变量。
2. runner 设置当前子进程专用环境标记后启动原版 Codex，保持参数、cwd、退出码和交互输入输出。
3. 插件的 `SessionStart` hook 只在存在本插件 launch 标记时，将事件中的真实 session ID/cwd/开始时间绑定到该 launch；不把“用户当前最新会话”当作替代品。
4. 通过 Codex 正常的 hook review/trust 流程使用 hook，不加入跳过信任、跳过审批或放宽 sandbox 的参数。未获信任或未收到绑定时，HUD 显示“等待会话绑定”，doctor 给出明确处理方式。
5. watcher 此后固定 session ID，允许该 session 在 compact/resume 后改变日志路径，但不跟随别的 session。子代理仅作为该会话的关联信息显示。
6. runner 用本插件自己的心跳/退出文件告知结束；watcher 不因正常等待授权而超时换绑。runner 崩溃或绑定缺失须显示可恢复的状态。
7. 手动 watch 必须显式指定会话，或先通过交互列表选择；多个候选时绝不默选。
8. 启动前检查依赖、目标 session 参数和 hook 配置可用性；无法可靠启动分屏时失败并保留原 Codex 的直接启动方式。

hook 只记录生命周期元数据。多数显示信息从本地日志读取，避免高频 hook 输出干扰模型上下文。

## 6. 数据适配与准确性

采用 `CodexReader -> HudSnapshot -> Renderer` 分层，渲染不直接扫描文件。独立 capability registry 说明字段是可用、尚无数据、未支持还是读取失败。

| 显示项 | 数据来源及规则 |
|---|---|
| 模型/effort/目录 | 当前会话 `turn_context`；使用最新有效值，不用全局配置冒充运行时值 |
| 上下文 | 最新 `token_count.info.last_token_usage` 与 `model_context_window`；不能使用累计 Token 作为上下文占用 |
| 会话 Token | 优先使用绝对累计快照；缓存输入、推理输出是相应总量的子集，不重复相加；`token_usage_record` 仅作兼容来源，不能双算 |
| 额度 | 日志里的实际 limit ID、窗口长度、比例、重置时间；缺失窗口不填 0，不硬编码 5h/7d；重置到期不自行假定新额度 |
| Git | 仅对绑定 cwd 执行只读 Git 命令，有超时和缓存；非 Git 项目仍正常显示 |
| 工具 | 依据 call ID 配对开始/完成/失败；只显示工具名和状态，不显示命令参数或正文；默认关闭 |
| agents | 结构化关联事件与父子关系；状态未知明确标注，不将“很久没更新”直接当作完成 |
| todos | 仅解析已知结构化计划更新工具的 JSON 字段；不从聊天文字猜待办，不运行或展示其自由文本参数以外的内容 |
| MCP | 区分配置项、禁用项及当前会话实际调用证据；无可靠连接证据时显示“配置/已调用/未知”，绝不把配置数标为在线数 |
| Skills | 仅结构化事件能确认时报告；一般的读 SKILL.md 行为不能可靠证明 active skill，缺数据时按未知处理 |
| 时长/压缩/最后响应时间 | 已知会话开始、压缩和完成事件；派生值标明语义 |
| 速度 | 仅存在可靠生成 Token 和生成耗时来源时显示；不用整个包含工具等待的 turn 时长计算 tok/s |
| 费用、cache TTL、Advisor、Claude output style 等 | Codex 无权威对应数据时显示不可用或隐藏，并在配置器解释；不估算收费、不虚构计时器 |

日志增量读取并缓存偏移；首次启动只扫描必要记录，避免每秒重读整份大 JSONL。容忍半行、损坏记录、字段扩展、文件截断/替换和暂时占用。日志解析仅保留 allowlist 字段，不把用户消息、模型正文、推理或工具输出写到插件文件。

默认约 1 秒刷新；无数据变化时仅刷新必要的时间字段。Git 数秒缓存，昂贵的配置/目录统计单独缓存。后台 reader 不阻塞终端输入。

## 7. 配置对齐范围

使用 claude-hud 风格 JSON：`language`、`lineLayout`、`showSeparators`、`pathLevels`、`maxWidth`、`forceMaxWidth`、`elementOrder`、`projectLineOrder`、`gitStatus`、`display`、`colors`。新增 Terminal/数据来源参数放专用分组，不混入显示开关。

用户配置固定保存在 `%LOCALAPPDATA%/mz-codex-hud/config.json`，运行状态另放 `runtime/`；升级不丢配置。仓库仅包含示例，不能写死用户本机路径。首版仅 user 配置和显式 `--config` 文件，不引入隐藏的项目层覆盖。

首版配置器涵盖：

- 布局：expanded / compact，分隔符，元素顺序、项目行顺序、mergeGroups、rightAlign，路径层数、换行/最大宽度。
- 预设：Full / Essential / Minimal，以及从用户现有 Claude 配置导入。Full 指打开所有具备数据适配的显示项，不代表伪造缺失指标。
- 身份：模型、effort 及显示格式、项目、会话名/ID、Codex 版本、provider 标签和自定义行。
- 上下文/用量：进度条、百分比/Token/剩余值、Token 明细与累计、额度条、紧凑额度、重置标签、短窗口/周窗口阈值、会话时间及压缩次数。
- 活动：Tools、Skills、MCP、agents、todos，各自可开关；不支持或缺少数据的功能在菜单中注明原因。
- Git：开关、dirty、ahead/behind、文件统计、长分支截断/换行及阈值。
- 样式：中文简体/繁体/英文，颜色、进度条字符、时间格式与刷新/分屏尺寸。

claude-hud 中没有 Codex 语义对应的键，例如 `showClaudeCodeVersion` 导入映射为 `showCodexVersion`；jj、认证用户、费用、外部额度文件、autocompactBuffer、modelSource 等高级项不能静默改变含义。导入器需逐项报告“等价映射 / 保留但当前不可用 / 未识别”，保留未知项以便无损再次保存，不执行配置中的命令或路径写出要求。

对齐意指配置结构、常用选项、交互习惯及显示风格对齐 claude-hud；不承诺 Codex 能提供 Claude 专用数据。发布说明必须给出完整兼容表，不能宣称无条件全功能等价。

导入仅复制显示偏好，不导入 Claude settings 的环境变量或 statusLine shell 命令。首次写配置前备份已有文件，后续保存用同目录临时文件原子替换。菜单取消不保存；配置无效保留原文件并使用最后一次有效配置，给出可操作错误。

## 8. 渲染与交互

展开模式按身份/项目、上下文/Token、额度、MCP/agents/todos 等语义行显示；活动关闭时不占行。组件仅在有数据或需要明确错误提示时出现。

所有文本移除终端控制序列；中文、emoji、组合字符按显示宽度截断与换行，保持 ANSI 色彩闭合。读取实际 columns/rows，默认预留 4 列；缩窄时先语义换行，再限制长字段。超过面板高度时显示溢出提示并允许滚动/切换视图，不无声丢掉重要数据。

配置器在自己的终端进程中运行，不占用 Codex 输入；可用键盘选择、逐项开关、查看预览、保存/取消。watcher 看到有效配置变更后热加载，不要求重启整个 Codex。

支持 `NO_COLOR`、非 TTY 的 once 输出和简洁错误信息。屏幕更新只清理本 HUD 面板，不向父终端输入区注入 ANSI，不发送鼠标/按键给 Codex。

## 9. 打包、安装与边界

- 同仓新增独立 Codex marketplace 清单和新插件 manifest，提供启动、配置、诊断技能及必要生命周期 hook。
- 使用标准 Node 启动方式；保留系统现有 `codex`、PowerShell profile、Windows Terminal settings 和 Claude 配置。
- 安装只在明确执行 setup/install 时注册本插件，不在模型每次读技能时隐式安装。
- 本地用户范围安装/测试属于后续实现验证；发布 npm/GitHub、推送远端或对外上架另行处理。
- 卸载只移除插件拥有的注册项、命令及运行文件；用户配置默认保留。没有理由删除会话日志、修改认证、改变代理网络或放宽 Codex 权限。
- 在日志、错误及配置预览中不输出凭证。提供来源归属和 MIT NOTICE。

## 10. 验证与验收

必须验证真实风险，不仅测试函数本身：

1. 两个相同 cwd 的并行会话以及子代理不会互相抢占 HUD；显式 resume 仍绑定原 session。
2. Token 缓存不重复计数，上下文使用最新快照；只有周窗口、缺窗口、重置到期、额度未知均正确呈现。
3. 断行/损坏/超大/截断/轮换 JSONL 不使 watcher 崩溃，不把内容写出或无限增长内存。
4. claude-hud 配置导入保留用户开关；不支持项有报告；未知字段往返不丢；错误 JSON、保存失败、取消均不覆盖已有文件。
5. 中文目录、空格、引号、分号、emoji 路径及用户参数通过 argv 传递，不拼接可执行 shell 字符串。
6. Windows Terminal 真机验证上下分屏、焦点、调整宽高、多开、关闭上方面板和关闭 HUD 的独立性。全程不产生收费模型调用来做自检。
7. plugin 安装发现、hook 未信任、hook 已信任、配置缺失等状态可诊断；不能用绕过 trust 的参数掩盖问题。
8. 窄屏/中文/emoji/无色/非 TTY 的布局稳定；关闭显示项后无残留空行，显示溢出提示。
9. 完成前运行单元/集成检查及本机 Terminal smoke test，报告实测与未覆盖范围。

## 11. 留给构建者的选择

模块命名、内部类型、测试工具、TOML parser 版本、可复用的具体 upstream 文件、CLI 菜单按键实现及准确分屏默认比例由构建者按本设计决定。禁止为了填满面板而创造数据、自动回退到另一个会话或扩大到工作流编排。

## 12. 参考

- 本机 claude-hud 0.8.0：`src/config.ts`、`commands/configure.md`、`src/render/` 与 MIT LICENSE。
- Windows Terminal 命令参数：https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments
- Codex hooks：https://learn.chatgpt.com/docs/hooks
- Codex 插件打包：https://developers.openai.com/plugins/build/plugins

独立 Windows 开发工具工程师已完成 builder check，结论为“nothing important left”。设计批准后再进入实施计划与编码。
