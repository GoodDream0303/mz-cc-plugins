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

拉起悬浮窗（Windows，`bin/claude-scope.exe`）。绿/黄灯到处都能用；红灯由本插件 hook 驱动，
标记写在 `~/.claude/.scope/attn/`，插件与独立 exe 两种装法共用此目录。

## 依赖

- **Windows**（悬浮窗为 Windows exe）。
- **Node.js** 在 PATH 上（hook 脚本为 Node 编写；缺 Node 则红灯不工作，绿/黄不受影响）。

## 目录结构

```
.claude-plugin/   插件与 marketplace 清单
hooks/            scope-attn.js / scope-clear.js + hooks.json(自动注册)
bin/              claude-scope.exe(悬浮窗)
skills/show/      /claude-scope:show 启动命令
```
