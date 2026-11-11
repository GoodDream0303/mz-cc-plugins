# HUD 紧凑分隔线后端方案

状态：**已实现、隔离编译并完成原型验收。** 当前构建与验证记录见
`codex-hud/backend/psmux-compact.json` 和 `codex-hud/docs/validation.md`。
下文保留设计依据；现场身份数据是排查快照，不作为当前资源定位依据。

## 目标与约束

压缩官方 Codex 底部快捷提示与 HUD 之间的分隔空间。继续使用未修改的官方 Codex，保留其原生状态栏与快捷提示内容；HUD 独立显示、独立关闭。保持服务端、会话、窗口、源 pane、HUD pane 和进程生命周期的精确身份校验。研究和验证均不发送模型请求，不启动额外真实模型会话，不重启或关闭现有真实会话。

## 已核实的现场

2026-11-03，通过已安装插件的 `dist/host-session.js` 执行 `loadCurrentHost('hook')`，然后使用该记录的 `PsmuxClient` 与精确 origin 做只读查询。未变更后端选项。

| 项目 | 现场结果 |
| --- | --- |
| Host | `eec1dfe2-b469-450a-a1e4-5866dd584c2c` |
| Server / session / window | PID `23900` / `codex` / `@1` |
| 源 pane | `%1`，PID `36328`，top `0`，bottom `23`，height `24`，width `120` |
| HUD pane | `%3`，PID `21968`，top `25`，bottom `29`，height `5`，width `120` |
| `show-options -g -v pane-border-status` | 空输出，未显式配置 |
| `show-options -g -v pane-border-format` | 空输出，未显式配置 |
| `show-options -g -v pane-border-lines` | `single` |

`capture-pane -p -t %1` 只去掉最后一个序列化换行后，恰好 24 行：输入提示在第 20 行，原生状态栏在第 22 行，快捷提示与警告在第 23 行。最后一个实际内容行之后有 **0 行**空白。因此此现场的第 24 行是分隔线专用行，第 25 行开始是 HUD，并未发现额外的源 pane 空行。

用户截图 `C:/Users/mzzhu2/Downloads/screenshot-20261103-144755.png` 在视觉上仍有明显间距。截图与上述只读采样不是同一帧，不能据此断言所有截图间距都是字体留白，也不能声称截图问题已解决。后续交互验收需要把屏幕与同一时刻的 pane 几何对应起来。

## 上游源码证据

研究基线是现用构建 `psmux 3.4.0 (20aa1d7)`，以下链接固定到该提交。

- [src/tree.rs](https://raw.githubusercontent.com/psmux/psmux/20aa1d7/src/tree.rs)：`split_with_gaps` 第 8–17 行固定扣除 `n-1` 个终端单元；第 64、66 行逐子节点加入间隔偏移。这是终端行/列，不是可调的像素边距。`compute_split_borders` 从同一几何计算拖动边界。
- [src/client.rs](https://raw.githubusercontent.com/psmux/psmux/20aa1d7/src/client.rs)：`render_layout_json` 第 2377–2384 行先分配带间隔的子区域，再决定是否画线；第 2427–2456 行将横线写到上 pane 下方的专用行。`pane_content_inner` 只有开启 border status 时才额外保留标签行；第 7719 行未设置的 border status 默认为 `off`。`is_on_separator`、`collect_layout_borders`、`mark_layout_borders` 及 hover/鼠标路径也依赖此布局。
- [src/border_lines.rs](https://raw.githubusercontent.com/psmux/psmux/20aa1d7/src/border_lines.rs)：`none` 返回无字符集，`spaces` 返回空格字符集。两者只影响绘制；不回收布局行。
- [src/layout.rs](https://raw.githubusercontent.com/psmux/psmux/20aa1d7/src/layout.rs)：pane 内容序列化遍历真实 `last_rows`，未发现无条件追加底部空白行的代码。
- [src/pane.rs](https://raw.githubusercontent.com/psmux/psmux/20aa1d7/src/pane.rs)：创建 split 的最小尺寸、初始 PTY 尺寸仍含一个 divider 的假设，需要随真正的零间隔方案一起审计。

结论：现有 `single`、`simple`、`spaces`、`none` 等配置不能减少这一整行。ConPTY 与 ANSI 终端提供字符单元内容，psmux 当前后端不能直接在字形的像素留白里画可独立命中的分隔线。

## 路线比较

| 路线 | 实际回收行数 | 拖动与复制 | 评价 |
| --- | --- | --- | --- |
| `spaces` / `none` | 0 | 原间隔仍在 | 不满足压缩目标 |
| ASCII `-`、线型或背景色调整 | 0 | 保持现状 | 仅外观变化 |
| 新增上沿字符 `▔` | 0 | 保持现状 | 可让可见线靠近上方，但仍消耗整行；字体效果待验证 |
| 零专用行 + 上 pane 最后一行下划线 + 修饰键拖动 | 1 | 普通文本选择保留；拖动改用修饰键 | 推荐原型路线，需定制后端 |
| 带像素分隔条的 GUI 终端宿主 | 可做到像素级 | 可有独立像素命中区 | 工程范围明显扩大，现有精确来源协议需重新接入 |

在保留终端字符网格的前提下，零专用行没有独立于文本的鼠标行：必须在复制选择与分隔拖动之间定义明确规则。不能同时承诺“零占行、普通拖动区域独立、文本点击完全不变”。

## 推荐原型：零专用行，叠加下划线

为自建后端增加默认关闭的紧凑模式。正式选项名称需要在取得完整源码后确定；不改变现有 `pane-border-lines none` 的语义。第一版仅支持 HUD 使用的上下双 pane、border status 关闭、非浮动布局；未支持布局应明确回到普通模式，不能混用两套坐标。

上下 pane 的布局间隔设为 0，左右分隔仍维持原行为。所有服务端 PTY 尺寸、`pane_height`、位置查询、客户端绘制与鼠标映射必须来自相同的几何规则。若总高度为 30 行且 HUD 请求 5 行，目标是源 pane 25 行与 HUD 5 行，二者直接相邻。必须核验 `split-window -l` 和后续 resize 真正保持请求尺寸，不能只改比例计算。

分隔线使用上 pane 最后一行的下划线属性。绘制时保留单元字符、前景色、背景色与其他属性，仅叠加统一的下划线及其颜色；不得写空格或横线覆盖原生快捷提示。下划线的实际位置、连续性、宽字符和选择高亮兼容性需要 Windows Terminal 实测。原生内容来自官方程序，外层叠加的下划线会改变该行外观，需要明确验收这一变化。

普通左键点击与拖动仍按文本选择或应用鼠标协议处理。建议只在该边界行使用 **Alt + 左键拖动** 调整高度；按下时锁定边界，后续 move/up 继续作用于该边界，不因移动离开初始行而切换 pane。修饰键拖动事件由宿主消费，不发送到 Codex。普通拖动、复制、右键粘贴与键盘交互继续走原路径。上游 `client.rs` 第 6497 行已将 Alt 拖动用于矩形选择，因此紧凑模式只在边界行抢占 Alt 拖动；其他行仍保留矩形选择，边界行上的矩形选择会被该组合替代。Alt 在 Windows Terminal 中是否被宿主截获也是验收项；若不可用，再选择经过验证的组合或显式 resize 模式。不得默默让整行普通左键操作都变为 resize。

hover 只在修饰键有效时提示可拖动边界，且只能调整下划线的提示属性，不能用整个 border style 重置原生文字颜色。复制结果必须只含原始文本，不混入分隔字符。

## 实现区域与版本控制

1. 取得完整固定提交源码后，为紧凑模式建立统一的 split 几何政策；审计 `tree::split_with_gaps` 的全部调用点与直接写死的 divider 数值，包括 `pane.rs` 创建 split、绝对行数请求、resize、位置查询与最小尺寸。首个隔离原型可采用显式 Cargo feature 构建独立二进制，普通构建不变，避免只设置客户端环境变量导致两端几何不同。
2. 原型所有服务端、附着客户端与控制命令使用同一带标识的二进制，并限制在独立 namespace。若后续作为运行时选项发布，再通过服务端 render state 和能力协商传递模式；旧客户端不能误附着到紧凑服务端后自行按原间隔解释布局。独立二进制和路径限制仅是原型隔离方式，不等于完整的客户端协议协商。
3. 更新 `client::render_layout_json`、separator geometry、hover、鼠标 hit test 和 resize 路径。紧凑横线不能再进入会替换字符的交叉线修复或箭头绘制路径。
4. 调整复制/鼠标分派优先级，并验证原生快捷提示和警告内容不被覆盖。
5. 发行独立且可识别的定制构建，记录来源提交、补丁、产物 SHA256 和许可证。插件的 `host-launch.ts` 与 `setup-readiness.ts` 目前固定接受 `20aa1d7`，应改为显式认可经过验证的定制版本/能力，不能伪装旧构建或无条件放宽校验。
6. 在隔离测试通过后，才为新启动的测试宿主接入。现有真实会话继续使用现有服务器与身份记录。替换运行中服务器会改变进程生命周期，不能直接沿用旧 proof；本提案不承诺热替换现有会话。

以上是实现设计，不是可直接套用的 Rust 补丁。尚未取得完整源码和编译上下文，不提供貌似可编译的片段。

### 已定位的修改入口

| 文件与入口 | 修改或审计重点 |
| --- | --- |
| `tree.rs::split_with_gaps` | 将总间隔扣除与每个子节点偏移统一使用同一个间隔宽度；上下紧凑间隔 0，左右仍为 1。 |
| `tree.rs::compute_rects`、`resize_window_panes`、`pane_inner_size` | 共享几何已经贯穿服务端布局与 PTY/parser resize；维持 slot 尺寸与 `last_rows/last_cols` 一致，不能再做第二套补偿。 |
| `tree.rs::compute_split_borders` | 紧凑边界命中行是上 pane 的 `bottom()-1`，不再是下 pane 的第一行；同一 helper 供客户端使用。 |
| `pane.rs::split_active_with_env` | 最小尺寸和初始半区尺寸含 `+1` / `saturating_sub(1)` divider 假设，需一致处理。 |
| `server/mod.rs` 的 `CtrlReq::SplitWindow` 与 `SplitWindowPrint` | 3039、3151 行起，两处 `-l` 都将单元数换算成整数百分比；不能只修其中一处。当前使用全窗口尺寸，需核验具体 split 区域和取整，确保 HUD 实际请求行数。 |
| `client.rs::collect_pane_rects`、`compute_active_rect_json`、`is_on_separator`、`collect_layout_borders`、`mark_layout_borders` | 所有 rect、边界位置、缩放、点击与 hover 一致；紧凑线不能作为普通 box glyph 进入交叉修复路径。 |
| `client.rs::render_layout_json` | 横向分隔分支目前写入 `h_char`；紧凑模式改为保留原单元文字和样式，添加下划线及颜色。 |
| `client.rs` 鼠标 Down、Drag、Up 与 hover | Down 的边界扫描在 6382–6411 行，紧凑行只有 Alt 才进入 `ClientDragState`；拖动开始时清理本次事件的待发送点击与文本选择状态，Drag/Up 继续使用锁定边界。 |
| `window_ops.rs::remote_mouse_down` | 旧的服务端全局鼠标路径在 1190–1205 行以容差 1 自动判断边界，没有 Alt 参数；紧凑横线不能继续走此自动 resize 判定。正常文本事件走 pane-local 路径，显式 resize 走 split-set-sizes。 |
| `window_ops.rs::handle_split_set_sizes`、`handle_split_resize_done` | 保留显式客户端拖动更新流程并核验最小尺寸、拖动完成和通知。 |

测试应先把“带给定 gap 的区域分割”“命中行与修饰键判定”“只增加下划线且不改文字的样式叠加”分为可直接调用的纯函数，避免用全局环境变量切换并行测试行为。构建成功后再用本地确定性文字程序检验真实 ConPTY 与鼠标事件。

## 验证与通过标准

先使用固定文字与控制序列的本地测试程序作为 pane 内容，不启动模型会话。

- 几何：相同总高度和 HUD 高度下专用 separator 行从 1 变为 0，源 pane 准确多出 1 行；内容序列化行数、PTYS、查询几何和实际绘制一致。普通模式输出保持一致。
- 绘制：两 pane 最后一行/第一行的带标记文字均完整，原生状态栏与快捷提示不被擦除；检查 ASCII、中文、宽字符、颜色与警告。终端大小变化及最小尺寸无裁切、重叠或内容缩放异常。
- 鼠标：普通选择/复制/粘贴保持正确；修饰键拖动可跨边界持续调整，并在 release 后终止；不会发送误输入，不会错误聚焦或影响另一 pane。
- 身份与生命周期：查询只命中指定 namespace/server/session/window/pane；HUD 独立关闭与重开不改变源进程，其他宿主不受影响；不存在基于焦点或标题猜测目标的路径。
- 兼容：不支持的布局回退明确；普通后端、旧客户端/新服务器不兼容组合被可靠拒绝或协商，不能显示错误坐标。
- 交互证据：保存同一帧的截图与精确几何，量化压缩前后的实际行数与像素间距。只有通过该步骤后才可声称视觉问题解决。

## 构建与交付

实现使用隔离的便携 Rust GNU 与资源编译工具构建，不要求终端用户安装
编译器。原型二进制、源码补丁、许可证、校验清单和可复核构建记录位于
`codex-hud/backend/`。紧凑模式关闭状态栏时统一使用零行预留，并在拖动中
同步 PTY 尺寸；这两点共同保证 footer 与下划线保持相邻。

正式安装后的真实 Codex hook 信任与新宿主接续仍须在部署流程中验收；
隔离测试程序不能替代该范围。运行中的真实会话未被替换。
