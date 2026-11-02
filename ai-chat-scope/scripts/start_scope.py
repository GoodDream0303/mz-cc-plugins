"""Windows launcher for the shared, single-instance monitor."""
import argparse
from pathlib import Path
import subprocess
import sys


def start_scope(plugin_root, extra_args=()):
    entry = Path(plugin_root).resolve() / "src" / "scope.pyw"
    if sys.platform != "win32" or not entry.is_file():
        return 1
    interpreter = Path(sys.executable)
    windowed = interpreter.with_name("pythonw.exe")
    if windowed.is_file():
        interpreter = windowed
    try:
        child = subprocess.Popen([str(interpreter), "-B", str(entry)] + list(extra_args),
            cwd=str(entry.parent), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW,
            close_fds=True)
        try:
            code = child.wait(timeout=.4)
            return 0 if code == 0 else 1
        except subprocess.TimeoutExpired:
            return 0
    except OSError:
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex-endpoint")
    parser.add_argument("--codex-token-file")
    args = parser.parse_args()
    if bool(args.codex_endpoint) != bool(args.codex_token_file):
        parser.error("Supply both Codex connection arguments")
    extra = []
    if args.codex_endpoint:
        extra = ["--codex-endpoint", args.codex_endpoint, "--codex-token-file", args.codex_token_file]
    status = start_scope(Path(__file__).resolve().parents[1], extra)
    print("AI Chat Scope 启动请求已发送；同一配置下已开的窗口会继续使用。" if status == 0
          else "无法启动 AI Chat Scope，请检查 Python、插件文件或运行目录中的 error.log。")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
