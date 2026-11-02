$ErrorActionPreference = 'Stop'
$hudRoot = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;using System.Runtime.InteropServices;
public class HudAttachWindow {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr FindWindow(string cls,string title);
 public static IntPtr ByTitle(string title) { return FindWindow(null,title); }
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
Push-Location $hudRoot
try {
 $demo = & node ./bin/hud.mjs demo --duration 20000
 if ($LASTEXITCODE -ne 0) { throw 'Demo owner failed to start.' }
 $ownerId = [regex]::Match(($demo -join "`n"),'Launch ID: ([a-f0-9-]+)').Groups[1].Value
 if (-not $ownerId) { throw 'Missing owner launch ID.' }
 $runtime = Join-Path $env:LOCALAPPDATA 'mz-codex-hud/runtime'
 $owner = Get-Content -Raw -LiteralPath (Join-Path $runtime ($ownerId+'.json')) | ConvertFrom-Json
 $attached = & node ./bin/hud.mjs start --session $owner.sessionId --sessions-root (Join-Path $owner.codexHome 'sessions') --window ('mz-codex-hud-'+$ownerId)
 if ($LASTEXITCODE -ne 0) { throw 'Passive attachment failed.' }
 $displayId = [regex]::Match(($attached -join "`n"),'Launch ID: ([a-f0-9-]+)').Groups[1].Value
 if (-not $displayId) { throw 'Missing display launch ID.' }
 $title = 'Codex HUD Preview '+$ownerId.Substring(0,8)
 $deadline = [DateTime]::UtcNow.AddSeconds(10)
 $text = ''
 $window = [IntPtr]::Zero
 while ([DateTime]::UtcNow -lt $deadline) {
  $window = [HudAttachWindow]::ByTitle($title)
  if ($window -ne [IntPtr]::Zero) {
   $element = [System.Windows.Automation.AutomationElement]::FromHandle($window)
   $parts = @()
   foreach ($item in $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)) {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { $parts += $pattern.DocumentRange.GetText(12000) }
   }
   $text = $parts -join "`n"
   if ([regex]::Matches($text,'22\.5%').Count -ge 2) { break }
  }
  Start-Sleep -Milliseconds 200
 }
 if ([regex]::Matches($text,'22\.5%').Count -lt 2) { throw 'The attached pane did not display the existing session.' }
 if (-not $text.Contains('Codex was not started')) { throw 'The original owner pane was not preserved.' }
 & node ./bin/hud.mjs stop --launch $displayId | Out-Null
 $deadline = [DateTime]::UtcNow.AddSeconds(6)
 do {
  $display = Get-Content -Raw -LiteralPath (Join-Path $runtime ($displayId+'.json')) | ConvertFrom-Json
  if ($display.state -eq 'exited') { break }
  Start-Sleep -Milliseconds 200
 } while ([DateTime]::UtcNow -lt $deadline)
 if ($display.state -ne 'exited') { throw 'The HUD did not close independently.' }
 $owner = Get-Content -Raw -LiteralPath (Join-Path $runtime ($ownerId+'.json')) | ConvertFrom-Json
 if ($owner.state -ne 'running') { throw 'Closing the HUD affected the owner.' }
 $deadline = [DateTime]::UtcNow.AddSeconds(25)
 while ([DateTime]::UtcNow -lt $deadline -and [HudAttachWindow]::IsWindow($window)) { Start-Sleep -Milliseconds 200 }
 if ([HudAttachWindow]::IsWindow($window)) { throw 'The temporary preview window did not close.' }
 Write-Output 'PASS: existing-window attachment, fixed session, preserved owner, and independent HUD close.'
} finally { Pop-Location }
