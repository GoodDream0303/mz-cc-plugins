' Start AI Chat Scope using Python from PATH, without a console.
Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
On Error Resume Next
shell.Run "pythonw.exe -B """ & here & "scope.pyw""", 0, False
If Err.Number <> 0 Then
  Err.Clear
  shell.Run "pyw.exe -3 -B """ & here & "scope.pyw""", 0, False
End If
If Err.Number <> 0 Then MsgBox "Python 3 with tkinter is required for AI Chat Scope."
