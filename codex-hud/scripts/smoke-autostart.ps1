$ErrorActionPreference='Stop'
$hudRoot=Split-Path $PSScriptRoot -Parent
$originalLocal=$env:LOCALAPPDATA
$originalPlugin=$env:PLUGIN_ROOT
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;using System.Runtime.InteropServices;
public class HudAutostartWindow {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr FindWindow(string cls,string title);
 public static IntPtr ByTitle(string title) { return FindWindow(null,title); }
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
Push-Location $hudRoot
try {
 $output=& node ./bin/hud.mjs demo --duration 25000
 if($LASTEXITCODE -ne 0){throw 'Preview owner failed.'}
 $ownerId=[regex]::Match(($output -join "`n"),'Launch ID: ([a-f0-9-]+)').Groups[1].Value
 if(-not $ownerId){throw 'Missing preview ID.'}
 $ownerFile=Join-Path $originalLocal ('mz-codex-hud/runtime/'+$ownerId+'.json')
 $deadline=[DateTime]::UtcNow.AddSeconds(5)
 do {
  $owner=Get-Content -Raw -LiteralPath $ownerFile | ConvertFrom-Json
  $transcript=Join-Path $owner.codexHome ('sessions/'+$owner.sessionId+'.jsonl')
  if(Test-Path -LiteralPath $transcript){break}
  Start-Sleep -Milliseconds 100
 } while([DateTime]::UtcNow -lt $deadline)
 $rows=[IO.File]::ReadAllLines($transcript)
 $head=$rows[0] | ConvertFrom-Json
 $head.payload | Add-Member -NotePropertyName source -NotePropertyValue cli -Force
 $rows[0]=$head | ConvertTo-Json -Depth 10 -Compress
 [IO.File]::WriteAllLines($transcript,$rows,[Text.UTF8Encoding]::new($false))
 $testLocal=Join-Path $env:TEMP ('mz-hud-auto-smoke-'+[Guid]::NewGuid().ToString('N'))
 $env:LOCALAPPDATA=$testLocal
 $env:PLUGIN_ROOT=$hudRoot
 & node ./bin/hud.mjs config set startup.window ('mz-codex-hud-'+$ownerId) | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Preview startup config failed.'}
 $event=@{hook_event_name='SessionStart';source='startup';session_id=$owner.sessionId;cwd=$owner.cwd;transcript_path=$transcript} | ConvertTo-Json -Compress
 $definition=Get-Content -Raw -LiteralPath './hooks/hooks.json' | ConvertFrom-Json
 $command=$definition.hooks.SessionStart[0].hooks[0].commandWindows
 $hookOutput=$event | & $env:COMSPEC /D /S /C $command
 if($LASTEXITCODE -ne 0 -or $hookOutput){throw 'The Windows hook failed or emitted stdout.'}
 $runtime=Join-Path $testLocal 'mz-codex-hud/runtime'
 $displays=@(Get-ChildItem -LiteralPath $runtime -Filter '*.json' | Where-Object {$_.BaseName -match '^[a-f0-9-]{36}$'})
 if($displays.Count -ne 1){throw 'Expected exactly one automatic display.'}
 $displayFile=$displays[0].FullName
 $title='Codex HUD Preview '+$ownerId.Substring(0,8)
 $deadline=[DateTime]::UtcNow.AddSeconds(8)
 $window=[IntPtr]::Zero
 $text=''
 do {
  $window=[HudAutostartWindow]::ByTitle($title)
  if($window -ne [IntPtr]::Zero){
   $root=[System.Windows.Automation.AutomationElement]::FromHandle($window)
   $parts=@()
   foreach($item in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)){
    $pattern=$null
    if($item.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)){$parts+=$pattern.DocumentRange.GetText(12000)}
   }
   $text=$parts -join "`n"
  }
  if([regex]::Matches($text,'22\.5%').Count -ge 2){break}
  Start-Sleep -Milliseconds 200
 } while([DateTime]::UtcNow -lt $deadline)
 if([regex]::Matches($text,'22\.5%').Count -lt 2){throw 'Automatic HUD telemetry did not appear.'}
 $event | & $env:COMSPEC /D /S /C $command | Out-Null
 $after=@(Get-ChildItem -LiteralPath $runtime -Filter '*.json' | Where-Object {$_.BaseName -match '^[a-f0-9-]{36}$'})
 if($after.Count -ne 1){throw 'The repeated startup hook created another display.'}
 $display=Get-Content -Raw -LiteralPath $displayFile | ConvertFrom-Json
 & node ./bin/hud.mjs stop --launch $display.id | Out-Null
 $deadline=[DateTime]::UtcNow.AddSeconds(8)
 do {$display=Get-Content -Raw -LiteralPath $displayFile | ConvertFrom-Json;if($display.state -eq 'exited'){break};Start-Sleep -Milliseconds 200}while([DateTime]::UtcNow -lt $deadline)
 if($display.state -ne 'exited'){throw 'Automatic HUD did not close independently.'}
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 while([DateTime]::UtcNow -lt $deadline -and [HudAutostartWindow]::IsWindow($window)){Start-Sleep -Milliseconds 200}
 if([HudAutostartWindow]::IsWindow($window)){throw 'Preview window did not close.'}
 Write-Output 'PASS: Windows hook command, automatic pane, quiet stdout, deduplication, and independent close.'
} finally {$env:LOCALAPPDATA=$originalLocal;$env:PLUGIN_ROOT=$originalPlugin;Pop-Location}
