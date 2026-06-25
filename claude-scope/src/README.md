# claude-scope 源码与重打包

悬浮窗源码。打包产物 `claude-scope.exe` 在上级 `../bin/`。

- `scope.pyw` — tkinter 悬浮窗源码（合法 UTF-8 无 BOM，可直接编辑）。exe 是**纯浮窗**：只读
  `~/.claude/sessions/*.json`(绿/黄)和 `~/.claude/.scope/attn/*.attn`(红),**不碰 settings.json**。
- `icon.ico` — 图标源（示波屏 + 绿/黄/红波形节点）。
- `start.vbs` — 脚本版静默启动器（不打包时的回退方式：`pythonw scope.pyw`）。

红灯标记由插件 `../hooks/scope-attn.js`(Notification hook，经 `../hooks/hooks.json` 自动注册)写入，
本程序只读，不负责注册 hook。

## 重打包

在本 `src/` 目录下执行（exe 不再嵌任何 JS）：

```
python -m PyInstaller --onefile --noconsole --clean --name claude-scope --icon icon.ico scope.pyw
```

产物在 `dist\claude-scope.exe`，覆盖到 `..\bin\claude-scope.exe`（覆盖前先 `Stop-Process -Name claude-scope`，
按精确名停，勿杀 python；之后删掉 `build\`、`dist\`、`claude-scope.spec` 等临时产物再提交）。

依赖：Python 3.13、PyInstaller 6.19、Pillow 12.2（已 pip 装好）。
