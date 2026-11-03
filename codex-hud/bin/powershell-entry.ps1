param([string]$HudCli,[string]$PluginId,[Parameter(Mandatory=$true)][string]$NodePath,[string]$ConfigPath)
$hudExisting=Get-Command codex -ErrorAction SilentlyContinue
if($hudExisting -and $hudExisting.CommandType -in @('Function','Alias')){
 if($hudExisting.CommandType -ne 'Function' -or -not [object]::ReferenceEquals($hudExisting.ScriptBlock,$global:MzCodexHudFunction)){throw 'An existing codex function or alias requires review before installing the HUD entry'}
}
$hudResolver=Join-Path $PSScriptRoot 'entry-resolver.mjs'
if(-not (Test-Path -LiteralPath $hudResolver -PathType Leaf)){$hudResolver=Join-Path $PSScriptRoot '../dist/entry-resolver.js'}
$hudCommand={
 $ErrorActionPreference='Stop'
 $hudArguments=@($args)
 # Resolve external commands anew after Codex or Node changes installation path.
 $hudOfficial=Get-Command codex -CommandType ExternalScript,Application -All -ErrorAction SilentlyContinue | Where-Object {$_.Path -match '\.(ps1|cmd|exe)$'} | Select-Object -First 1
 if(-not $hudOfficial){throw 'The original official Codex command was not found'}
 $hudNode=$NodePath
 if(-not (Test-Path -LiteralPath $hudNode -PathType Leaf)){
  $hudNodeCommand=Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $hudNode=if($hudNodeCommand){$hudNodeCommand.Source}else{$null}
 }
 $hudInvocation=@{command=$hudOfficial.Path;args=$hudArguments}
 $hudEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $hudInvocation -Depth 4 -Compress)))
 $hudParentPath=$env:PATH
 $hudParentConfig=$env:MZ_HUD_CONFIG_FILE
 try {
  if($hudNode){$env:PATH=(Split-Path -Parent $hudNode)+[IO.Path]::PathSeparator+$hudParentPath}
  if($ConfigPath){$env:MZ_HUD_CONFIG_FILE=$ConfigPath}
  $hudSelected=$null
  if($hudNode -and (Test-Path -LiteralPath $hudResolver -PathType Leaf)){
   $hudRequest=@{command=$hudOfficial.Path;hint=$HudCli;pluginId=$PluginId}
   if(-not $PluginId){$hudRequest.Remove('pluginId')}
   $hudRequest64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $hudRequest -Compress)))
   # Only resolution may select fallback; a nonzero session exit is never retried.
   try {
    $hudResolution=(& $hudNode $hudResolver resolve $hudRequest64 2>$null | Out-String)
    if($LASTEXITCODE -eq 0){$hudSelected=($hudResolution | ConvertFrom-Json).cli}
   } catch {$hudSelected=$null}
   if($hudSelected){
    if($MyInvocation.ExpectingInput){$input | & $hudNode $hudSelected codex-entry --invocation64 $hudEncoded}
    else {& $hudNode $hudSelected codex-entry --invocation64 $hudEncoded}
   } else {
    [Console]::Error.WriteLine('Codex HUD: unavailable; starting official Codex without HUD.')
    if($MyInvocation.ExpectingInput){$input | & $hudNode $hudResolver official $hudEncoded}
    else {& $hudNode $hudResolver official $hudEncoded}
   }
  } else {
   [Console]::Error.WriteLine('Codex HUD: entry runtime unavailable; starting official Codex without HUD.')
   if($MyInvocation.ExpectingInput){$input | & $hudOfficial.Path @hudArguments}
   else {& $hudOfficial.Path @hudArguments}
  }
  $hudExit=$LASTEXITCODE
 } finally {$env:PATH=$hudParentPath;$env:MZ_HUD_CONFIG_FILE=$hudParentConfig}
 $global:LASTEXITCODE=$hudExit
}.GetNewClosure()
Set-Item -Path Function:global:codex -Value $hudCommand
$global:MzCodexHudEntry=if($PluginId){$PluginId}else{$HudCli}
$global:MzCodexHudFunction=(Get-Command codex -CommandType Function).ScriptBlock
