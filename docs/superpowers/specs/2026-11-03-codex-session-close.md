# Codex session close

Provide an explicit **关闭 Codex 会话…** action alongside copy ID. Closing a terminal can leave a standalone Codex CLI alive and holding its thread writer lock. Restarting Scope cannot release that lock.

Use Windows Restart Manager to identify the owner of the selected session's existing writer-lock file, only after the user selects this action. A separate short-lived helper opens that exact process, checks its creation time, executable name and command line, and returns its identity for confirmation. Confirmed termination rechecks the file owner and process identity and terminates through the checked process handle. Shared app-server and other noninteractive Codex modes are rejected. Unknown, ambiguous, inaccessible or changed identities cancel the operation.

The confirmation explains that this ends the selected CLI process and interrupts unfinished work, preserves its transcript, and does not archive it. Do not terminate any existing user session during automated validation. Monitoring continues to use file locks without process inspection. A successful close requires both process exit and writer-lock release; normal polling then removes the row, including after Scope restarts.

Approaches considered: persistent row hiding would leave the process running; native archive changes history organization and is not a reliable way to terminate a separate CLI owning the writer lock. Exact-owner termination addresses the observed independent residual processes. Graceful console injection is deferred because a closed terminal can have no usable console and input injection cannot prove which foreground program will receive it.

Keep Windows, Python 3.9+, tkinter/standard-library-only support. Preserve Claude closing behavior, hook trust, runtime configuration and all unrelated work. No automatic publishing or reinstalling.
