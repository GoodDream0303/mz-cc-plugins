# claude-scope 悬浮窗(纯 Python,不打包)

悬浮窗程序本体。插件 `/claude-scope:scope-show` 用 `pyw "<plugin>/src/scope.pyw"` 直接运行,**不再打包 exe**
（避免 onefile 运行期解压 Python 运行时被 EDR/AV 拦导致 `failed to start embedded python interpreter`）。

- `scope.pyw` — tkinter 悬浮窗（合法 UTF-8 无 BOM，可直接编辑）。**纯浮窗**：只读
  `~/.claude/sessions/*.json`(红/绿/黄,按 `status`)和 `~/.claude/jobs/*/state.json`(蓝)，**不碰 settings.json**；
  窗口配置与日志写 `%LOCALAPPDATA%\claude-scope\`。
  唯一碰其它进程的地方是右键「关闭」：用户确认后一次性起外部命令（`claude stop`，或子进程
  `scope.pyw --quit-session <pid>` 往目标控制台注入 Ctrl+C，必要时再确认 `taskkill`），轮询中从不访问进程。
  运行期只依赖标准库 + tkinter（CPython 自带），无第三方依赖。
- `icon.ico` — 图标源（示波屏 + 绿/黄/红波形节点）。**当前未在运行期使用**（原是打 exe 时嵌图标用）。
- `start.vbs` — 双击静默启动器（`pythonw scope.pyw`），桌面快捷方式可用。

## 运行 / 调试

```
pyw scope.pyw          # 无窗口启动器(插件用这个)
pythonw scope.pyw      # 等价回退
python scope.pyw       # 带控制台,看报错用
```

依赖:Python 3（标准安装自带 `pyw` 启动器与 tkinter）。改完 `scope.pyw` 直接 git 推送即可，**无构建步骤**；
用户侧 `/plugin update` + `/reload-plugins` 生效。
