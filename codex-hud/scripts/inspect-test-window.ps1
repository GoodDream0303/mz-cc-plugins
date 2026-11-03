param([Parameter(Mandatory=$true)][string]$Title,[string]$CaptureFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class HudTestWindow {
 [StructLayout(LayoutKind.Sequential)]public struct Rect {public int L,T,R,B;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
}
'@
[HudTestWindow]::SetProcessDPIAware() | Out-Null
$hudWindows=@([System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -eq $Title -and $_.Current.ClassName -eq 'CASCADIA_HOSTING_WINDOW_CLASS'})
if($hudWindows.Count -ne 1){throw 'Exactly one owned test window is required'}
$hudRoot=$hudWindows[0];$hudHandle=[IntPtr]$hudRoot.Current.NativeWindowHandle
$hudAll=$hudRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$hudTabs=@();$hudTexts=@();$hudPanes=@()
foreach($hudItem in $hudAll){
 $hudPattern=$null
 if($hudItem.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem -and $hudItem.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$hudPattern)){$hudTabs+=@{name=$hudItem.Current.Name;selected=$hudPattern.Current.IsSelected}}
 $hudPattern=$null
 if(-not $hudItem.Current.IsOffscreen -and $hudItem.Current.ClassName -eq 'TermControl' -and $hudItem.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$hudPattern)){
  $hudText=$hudPattern.DocumentRange.GetText(12000);$hudTexts+=$hudText;$hudBounds=$hudItem.Current.BoundingRectangle
  $hudPanes+=@{text=$hudText;focused=$hudItem.Current.HasKeyboardFocus;left=$hudBounds.Left;top=$hudBounds.Top;width=$hudBounds.Width;height=$hudBounds.Height}
 }
}
if($CaptureFile){
 [HudTestWindow]::SetForegroundWindow($hudHandle) | Out-Null
 Start-Sleep -Milliseconds 200
 if([HudTestWindow]::GetForegroundWindow() -ne $hudHandle){throw 'Owned test window is not foreground; capture refused'}
 $hudRect=New-Object HudTestWindow+Rect
 if(-not [HudTestWindow]::GetWindowRect($hudHandle,[ref]$hudRect)){throw 'Test window bounds unavailable'}
 # Exclude rounded outer borders, which can reveal unrelated background windows.
 $hudBitmap=New-Object System.Drawing.Bitmap ($hudRect.R-$hudRect.L-16),($hudRect.B-$hudRect.T-16)
 try{$hudGraphics=[System.Drawing.Graphics]::FromImage($hudBitmap);try{$hudGraphics.CopyFromScreen($hudRect.L+8,$hudRect.T+8,0,0,$hudBitmap.Size)}finally{$hudGraphics.Dispose()};$hudBitmap.Save($CaptureFile,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$hudBitmap.Dispose()}
}
@{title=$Title;tabs=$hudTabs;panes=$hudPanes;text=($hudTexts -join "`n");capture=$CaptureFile}|ConvertTo-Json -Depth 6 -Compress
