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
  $hudFailure='entry-resolution'
  if($hudNode -and (Test-Path -LiteralPath $hudResolver -PathType Leaf)){
   $hudRequest=@{command=$hudOfficial.Path;hint=$HudCli;pluginId=$PluginId}
   if(-not $PluginId){$hudRequest.Remove('pluginId')}
   $hudRequest64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $hudRequest -Compress)))
   # Only resolution may select fallback; a nonzero session exit is never retried.
   try {
    $hudResolution=(& $hudNode $hudResolver resolve $hudRequest64 2>$null | Out-String)
    $hudResolverExit=$LASTEXITCODE
    $hudResolved=$hudResolution | ConvertFrom-Json
    if($hudResolverExit -eq 0){$hudSelected=$hudResolved.cli}
    elseif($hudResolved.reason -match '^[a-z-]+:[A-Z0-9_]{1,64}$'){$hudFailure=$hudResolved.reason}
   } catch {$hudSelected=$null}
  }
  if($hudSelected){
   if($MyInvocation.ExpectingInput){$input | & $hudNode $hudSelected codex-entry --invocation64 $hudEncoded}
   else {& $hudNode $hudSelected codex-entry --invocation64 $hudEncoded}
  } else {
   [Console]::Error.WriteLine('Codex HUD: unavailable ['+$hudFailure+']; starting official Codex without HUD.')
   if($hudNode){
    # Keep this fallback independent of every plugin/runtime file. Encoding the
    # request preserves literal argv even with PS5 native argument conversion.
    $hudFallback=@'
const fs=require('node:fs'),path=require('node:path');
try {
 const r=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
 let file=fs.realpathSync(r.command),args=r.args;
 if(['.ps1','.cmd'].includes(path.extname(file).toLowerCase())){
  const directory=path.dirname(file),root=path.join(directory,'node_modules','@openai','codex');
  const p=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),entry=typeof p.bin==='string'?p.bin:p.bin?.codex;
  if(p.name!=='@openai/codex'||typeof entry!=='string')throw Error();
  const script=fs.realpathSync(path.resolve(root,entry)),relative=path.relative(fs.realpathSync(root),script);
  if(relative.startsWith('..')||path.isAbsolute(relative)||path.extname(script)!=='.js')throw Error();
  const adjacent=path.join(directory,'node.exe');file=fs.existsSync(adjacent)?adjacent:process.execPath;args=[script,...args];
 }
 const child=require('node:child_process').spawn(file,args,{stdio:'inherit'});
 process.on('SIGINT',()=>{});
 child.once('error',()=>{console.error('Official Codex could not start.');process.exitCode=1;});
 child.once('exit',(code,signal)=>{process.exitCode=code??(signal?130:1);});
} catch {console.error('Official Codex launcher is unavailable.');process.exitCode=1;}
'@
    if($MyInvocation.ExpectingInput){$input | & $hudNode -e $hudFallback $hudEncoded}
    else {& $hudNode -e $hudFallback $hudEncoded}
   } else {
    if($MyInvocation.ExpectingInput){$input | & $hudOfficial.Path @hudArguments}
    else {& $hudOfficial.Path @hudArguments}
   }
  }
  $hudExit=$LASTEXITCODE
 } finally {$env:PATH=$hudParentPath;$env:MZ_HUD_CONFIG_FILE=$hudParentConfig}
 $global:LASTEXITCODE=$hudExit
}.GetNewClosure()
Set-Item -Path Function:global:codex -Value $hudCommand
$global:MzCodexHudEntry=if($PluginId){$PluginId}else{$HudCli}
$global:MzCodexHudFunction=(Get-Command codex -CommandType Function).ScriptBlock
