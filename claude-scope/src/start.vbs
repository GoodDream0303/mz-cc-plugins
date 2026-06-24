' 静默启动 claude-scope(无控制台窗口)。双击本文件即可,或放入"启动"文件夹开机自启。
Dim shell, here, py
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
py = "C:\Users\mzzhu2\AppData\Local\Programs\Python\Python313\pythonw.exe"
shell.Run """" & py & """ """ & here & "scope.pyw""", 0, False
