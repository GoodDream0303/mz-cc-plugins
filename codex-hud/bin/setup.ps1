param(
 [string]$ProfilePath=$PROFILE.CurrentUserCurrentHost,
 [string]$PsmuxPath,
 [string]$NodePath,
 [string]$ConfigPath,
 [switch]$Enable,
 [switch]$Apply,
 [switch]$Remove
)
$ErrorActionPreference='Stop'
if(-not $NodePath){
 $hudNodeCommand=Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if($hudNodeCommand){$NodePath=$hudNodeCommand.Source}
}
if(-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)){
 throw 'Node.js 20 or newer is required. Install Node.js or pass -NodePath with its absolute executable path, then rerun setup.'
}
$hudNodeVersion=(& $NodePath --version | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $hudNodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20){
 throw 'Node.js 20 or newer is required; the selected Node executable is unsupported.'
}
$hudCli=Join-Path $PSScriptRoot 'hud.mjs'
if(-not (Test-Path -LiteralPath $hudCli -PathType Leaf)){throw 'The installed HUD entry is missing; reinstall the plugin from the formal marketplace.'}
$hudSetupArguments=@($hudCli,'setup','--profile',$ProfilePath)
if(-not $Remove){$hudSetupArguments+='--initialize'}
if($PsmuxPath){$hudSetupArguments+=@('--psmux',$PsmuxPath)}
if($ConfigPath){$hudSetupArguments+=@('--config',$ConfigPath)}
if($Enable){$hudSetupArguments+='--enable'}
if($Apply){$hudSetupArguments+='--apply'}
if($Remove){$hudSetupArguments+='--remove'}
& $NodePath @hudSetupArguments
exit $LASTEXITCODE
