param([string]$ScreenshotPath)
$ErrorActionPreference = 'Stop'
$hudRoot = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class HudSmokeWindow {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls,string title);
 public static IntPtr FindByTitle(string title) { return FindWindow(null,title); }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
Push-Location $hudRoot
try {
 $output = & node ./bin/hud.mjs demo --duration 15000
 if ($LASTEXITCODE -ne 0) { throw 'Demo launch failed.' }
 $launchId = [regex]::Match(($output -join "`n"),'Launch ID: ([a-f0-9-]+)').Groups[1].Value
 if (-not $launchId) { throw 'Launch ID was not reported.' }
 $title = 'Codex HUD Preview ' + $launchId.Substring(0,8)
 $deadline = [DateTime]::UtcNow.AddSeconds(10)
 $window = [IntPtr]::Zero
 $text = ''
 while ([DateTime]::UtcNow -lt $deadline) {
  $window = [HudSmokeWindow]::FindByTitle($title)
  if ($window -ne [IntPtr]::Zero) {
   $element = [System.Windows.Automation.AutomationElement]::FromHandle($window)
   $parts = @()
   foreach ($item in $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)) {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { $parts += $pattern.DocumentRange.GetText(10000) }
   }
   $text = $parts -join "`n"
   if ($text.Contains('22.5%') -and $text.Contains('Context')) { break }
  }
  Start-Sleep -Milliseconds 200
 }
 if (-not $text.Contains('22.5%') -or -not $text.Contains('Context')) { throw 'Telemetry did not appear in the Terminal preview.' }
 if ($text -match 'ReferenceError|SyntaxError|Waiting for SessionStart') { throw 'Terminal preview contains a startup error.' }
 if ($ScreenshotPath) {
  $resolved = [System.IO.Path]::GetFullPath($ScreenshotPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolved)) | Out-Null
  $rect = New-Object HudSmokeWindow+RECT
  if (-not [HudSmokeWindow]::GetWindowRect($window,[ref]$rect)) { throw 'Cannot capture preview window.' }
  $image = New-Object System.Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  try { $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$image.Size); $image.Save($resolved,[System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $graphics.Dispose(); $image.Dispose() }
 }
 $deadline = [DateTime]::UtcNow.AddSeconds(25)
 while ([DateTime]::UtcNow -lt $deadline -and [HudSmokeWindow]::IsWindow($window)) { Start-Sleep -Milliseconds 200 }
 if ([HudSmokeWindow]::IsWindow($window)) { throw 'Preview panes did not close after the runner exited.' }
 Write-Output ('PASS: Windows Terminal split, exact demo binding, English telemetry, and lifecycle cleanup. Launch '+$launchId)
} finally { Pop-Location }
