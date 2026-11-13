# Native process observer

`process-events.c` implements only exact process liveness and requested identity
snapshots. It never changes a process or terminal. The offline runtime ships
`backend/process-events.exe` and `backend/process-events.json`; Windows system
libraries are its only runtime requirements. Initial ancestry and physical-pane
proof remain the responsibility of the host/viewer.

The build checks the source and binary hashes without a compiler. To explicitly
rebuild from this directory's parent:

```powershell
node scripts/build-process.mjs --zig 'ABSOLUTE_PATH_TO_ZIG_EXE'
```

The recorded compiler is portable Zig 0.17.1, Windows x86_64. Its original archive
is `https://ziglang.org/download/0.17.1/zig-x86_64-windows-0.17.1.zip`, SHA256
`b03f477a1943673e02aca0f570e8030dffd536ce1f45cbc4d3326ec31159562e`.
Verify the official archive before extraction. The generated manifest records
the actual compiler executable hash, version and exact command, along with the
source and resulting binary hashes. Compilation/download is never part of HUD
startup; a stale or modified artifact is rejected rather than silently rebuilt.

Each observer's command line lists the viewer PID and the already-proven process
scope with Windows-epoch microsecond creation times. Stdout carries bounded JSON
lines; stdin accepts `F request-id pid ...` and `Q`. Facts are collected anew using
Toolhelp plus process query handles; wait handles pin the monitored incarnations.
Snapshot completion and creation-time boundaries prevent pairing reused PIDs with
old parent/name entries. Existing WMI proofs and native values compare at their
common microsecond precision, never only at millisecond precision.

An observed exit is distinct from an API/protocol failure. The TypeScript owner
handles retries, cancellation, binding generations and the sole authority to
interpret those events. A live handle does not authorize any pane mutation.
