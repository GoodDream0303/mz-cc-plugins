# claude-scope

实时监视多个 Claude Code 会话状态的半透明置顶悬浮窗 —— 一眼看清每个 Claude 在干嘛。

- 🔴 **红灯**：需要你（等待授权 / 回答）
- 🔵 **蓝灯**：等待后台（agent / workflow 运行中）
- 🟢 **绿灯**：正在思考 / 执行中（busy）
- 🟡 **黄灯**：待机（idle）

**状态优先级**：红 > 蓝 > 绿 > 黄

窗口可拖动、调透明度（滑块 / 滚轮）、自由缩放、置顶。占用极低（tkinter，约 45MB / CPU ≈ 1%）。
鼠标悬停在蓝灯会话上可查看后台任务详情（任务名称、状态、节奏）。
右键某行可「关闭」该会话（确认后执行）：后台会话走 `claude stop <jobId>`；交互会话往其终端注入 Ctrl+C 正常退出，
5 秒内没退出再询问是否 `taskkill` 强制结束（强杀后该终端可能残留鼠标乱码，关掉标签即可；对话可 `claude --resume` 接回）。

## 安装

```
/plugin marketplace add GoodDream0303/mz-cc-plugins
/plugin install claude-scope@mz-cc-plugins
```

无需注册任何 hook，也不改 `settings.json`。

## 使用

```
/claude-scope:scope-show
```

用系统 Python 的无窗口启动器 `pyw` 直接跑 `src/scope.pyw` 拉起悬浮窗（不打包 exe）。
四种灯全部读 Claude Code 自己写的 `~/.claude/sessions/<PID>.json`（`status`：`waiting`=红、`idle`=黄、其余=绿）
与 `~/.claude/jobs/<id>/state.json`（蓝）。窗口配置与日志存放在 `%LOCALAPPDATA%\claude-scope\`，插件升级不丢。

## 依赖

- **Windows**。
- **Python 3** 在 PATH 上（悬浮窗为 tkinter 脚本，标准 Python 自带 tkinter 与 `pyw` 启动器；缺则浮窗起不来）。
- **Claude Code 新版**（会话文件带 `status:"waiting"`；2.1.296 实测可用）。旧版不写该状态，红灯不亮，其余不受影响。

## 目录结构

```
.claude-plugin/   插件与 marketplace 清单
src/              scope.pyw(tkinter 悬浮窗，由 pyw 直接运行) + icon.ico / start.vbs
skills/scope-show/   /claude-scope:scope-show 启动命令
```
