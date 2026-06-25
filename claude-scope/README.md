# claude-scope

实时监视多个 Claude Code 会话状态的半透明置顶悬浮窗 —— 一眼看清每个 Claude 在干嘛。

- 🟢 **绿灯**：正在思考 / 执行中（busy）
- 🟡 **黄灯**：待机（idle）
- 🔴 **红灯**：需要你（等待授权 / 回答）

窗口可拖动、调透明度（滑块 / 滚轮）、自由缩放、置顶。占用极低（tkinter，约 45MB / CPU ≈ 1%）。

## 安装

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install claude-scope@mz-cc-plugins
```

装上后红灯所需的 hook（`Notification` / `UserPromptSubmit`）会**自动注册**，无需手改 `settings.json`。

## 使用

```
/claude-scope:show
```

用系统 Python 的无窗口启动器 `pyw` 直接跑 `src/scope.pyw` 拉起悬浮窗（不打包 exe）。
绿/黄灯到处都能用；红灯由本插件 hook 驱动，标记写在 `~/.claude/.scope/attn/`。

## 依赖

- **Windows**。
- **Python 3** 在 PATH 上（悬浮窗为 tkinter 脚本，标准 Python 自带 tkinter 与 `pyw` 启动器；缺则浮窗起不来）。
- **Node.js** 在 PATH 上（hook 脚本为 Node 编写；缺 Node 则红灯不工作，绿/黄不受影响）。

## 目录结构

```
.claude-plugin/   插件与 marketplace 清单
hooks/            scope-attn.js / scope-clear.js + hooks.json(自动注册)
src/              scope.pyw(tkinter 悬浮窗，由 pyw 直接运行) + icon.ico / start.vbs
skills/show/      /claude-scope:show 启动命令
```
