$ErrorActionPreference='Stop'
try {
 $ancestor=Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
 for($level=0;$level -lt 10 -and $ancestor -and $ancestor.Name -ne 'codex.exe';$level++){
  $ancestor=Get-CimInstance Win32_Process -Filter "ProcessId=$($ancestor.ParentProcessId)"
 }
 if(-not $ancestor -or $ancestor.Name -ne 'codex.exe'){exit 0}
 Add-Type @'
using System;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
public static class HudViewport {
 [StructLayout(LayoutKind.Sequential)]public struct Coord {public short X,Y;}
 [StructLayout(LayoutKind.Sequential)]public struct Rect {public short Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)]public struct Info {public Coord Size,Cursor;public short Attributes;public Rect Window;public Coord Max;}
 [DllImport("kernel32.dll")]public static extern bool FreeConsole();
 [DllImport("kernel32.dll")]public static extern bool AttachConsole(uint id);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]public static extern SafeFileHandle CreateFile(string file,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll")]public static extern bool GetConsoleScreenBufferInfo(SafeFileHandle handle,out Info info);
}
'@
 # Only this helper detaches/attaches; no owner handles or window sizes change.
 [HudViewport]::FreeConsole() | Out-Null
 if(-not [HudViewport]::AttachConsole($ancestor.ProcessId)){exit 0}
 try {
  $handle=[HudViewport]::CreateFile('CONOUT$',2147483648,3,[IntPtr]::Zero,3,0,[IntPtr]::Zero)
  try {
   $info=New-Object HudViewport+Info
   if([HudViewport]::GetConsoleScreenBufferInfo($handle,[ref]$info)){
    @{columns=($info.Window.Right-$info.Window.Left+1);rows=($info.Window.Bottom-$info.Window.Top+1)} | ConvertTo-Json -Compress
   }
  } finally {$handle.Dispose()}
 } finally {[HudViewport]::FreeConsole() | Out-Null}
} catch {exit 0}
