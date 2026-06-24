# claude-scope 源码与重打包

悬浮窗源码。打包产物 `claude-scope.exe` 在上级 `../bin/`,红灯 hook 在 `../hooks/`。

- `scope.pyw` — tkinter 悬浮窗源码（合法 UTF-8 无 BOM，可直接编辑）。
- `icon.ico` — 图标源（示波屏 + 绿/黄/红波形节点）。
- `start.vbs` — 脚本版静默启动器（不打包时的回退方式：`pythonw scope.pyw`）。

## 重打包（必须带 `--add-data` 把两个 JS 嵌进 exe，否则单 exe 分发时红灯初始化释不出脚本）

在本 `src/` 目录下执行：

```
python -m PyInstaller --onefile --noconsole --clean --name claude-scope --icon icon.ico ^
  --add-data "..\hooks\scope-attn.js;hooks" ^
  --add-data "..\hooks\scope-clear.js;hooks" scope.pyw
```

产物在 `dist\claude-scope.exe`，覆盖到 `..\bin\claude-scope.exe`（覆盖前先 `Stop-Process -Name claude-scope`，按精确名停，勿杀 python）。

依赖：Python 3.13、PyInstaller 6.19、Pillow 12.2（已 pip 装好）。
