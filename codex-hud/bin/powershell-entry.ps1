param([Parameter(Mandatory=$true)][string]$HudCli,[Parameter(Mandatory=$true)][string]$NodePath)
$hudExisting=Get-Command codex -ErrorAction SilentlyContinue
if($hudExisting -and $hudExisting.CommandType -in @('Function','Alias')){
 if($hudExisting.CommandType -ne 'Function' -or -not [object]::ReferenceEquals($hudExisting.ScriptBlock,$global:MzCodexHudFunction)){throw 'An existing codex function or alias requires review before installing the HUD entry'}
}
$hudOfficial=Get-Command codex -CommandType ExternalScript,Application -All -ErrorAction SilentlyContinue | Where-Object {$_.Path -match '\.(ps1|exe)$'} | Select-Object -First 1
if(-not $hudOfficial){throw 'The original official Codex command was not found'}
if(-not (Test-Path -LiteralPath $HudCli) -or -not (Test-Path -LiteralPath $NodePath)){throw 'The HUD entry path is unavailable; rerun setup for the installed plugin'}
$hudPreviousExit=Get-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
if($hudPreviousExit){$hudPreviousExitValue=$hudPreviousExit.Value}
try {
 & $NodePath $HudCli entry-check
 if($LASTEXITCODE -ne 0){throw 'The HUD entry is obsolete or unavailable; rerun setup from the active installed plugin'}
} finally {
 if($hudPreviousExit){$global:LASTEXITCODE=$hudPreviousExitValue}else{Remove-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue}
}
$hudOfficialPath=$hudOfficial.Path
$hudCommand={
 $ErrorActionPreference='Stop'
 $hudArguments=@($args)
 $hudInvocation=@{command=$hudOfficialPath;args=$hudArguments}
 $hudEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $hudInvocation -Depth 4 -Compress)))
 if($MyInvocation.ExpectingInput){$input | & $NodePath $HudCli codex-entry --invocation64 $hudEncoded}
 else {& $NodePath $HudCli codex-entry --invocation64 $hudEncoded}
 $global:LASTEXITCODE=$LASTEXITCODE
}.GetNewClosure()
Set-Item -Path Function:global:codex -Value $hudCommand
$global:MzCodexHudEntry=$HudCli
$global:MzCodexHudFunction=(Get-Command codex -CommandType Function).ScriptBlock
