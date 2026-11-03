import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {get,startupEnabled,validateConfig,type Config} from './config.js';
import {resolveOfficial} from './host-launch.js';
import {verifyBackend,effectiveBackendPath} from './backend-version.js';

export interface SetupDependencies {
 isFile?:(file:string)=>boolean;
 version?:(file:string)=>string;
 findCodex?:()=>string|undefined;
 resolveCodex?:(command:string)=>{file:string;prefix:string[]};
}
export interface InspectSetupOptions {
 officialCommand?:string;nodeVersion?:string;platform?:NodeJS.Platform;configValid?:boolean;dependencies?:SetupDependencies;
}
interface Prerequisite {status:string;path?:string;version?:string;kind?:'npm'|'native'}
export interface SetupReadiness {
 ready:boolean;scope:'runtime-prerequisites-only';required:string[];steps:string[];
 prerequisites:{node:Prerequisite;platform:Prerequisite;psmux:Prerequisite;codex:Prerequisite;configuration:Prerequisite};
 preferences:{autoStart:string;legacyEnabled:boolean;effectiveEnabled:boolean};
 hookTrust:'unknown';interactiveAcceptance:'unverified';
}
function isFile(file:string):boolean {try{return fs.statSync(file).isFile();}catch{return false;}}
function findCodex():string|undefined {
 // Resolve launchers without loading user profiles or executing Codex. Keep the
 // same supported launcher order as the PowerShell entry.
 const result=spawnSync('where.exe',['codex.ps1','codex.exe','codex.cmd'],{encoding:'utf8',windowsHide:true,timeout:1500,maxBuffer:16384});
 return result.stdout?.split(/\r?\n/).map(line=>line.trim()).find(file=>path.isAbsolute(file)&&isFile(file));
}
export function inspectSetup(config:Config,options:InspectSetupOptions={}):SetupReadiness {
 const deps=options.dependencies??{},required:string[]=[],steps:string[]=[];
 const version=options.nodeVersion??process.version,major=/^v?(\d+)\./.exec(version);
 const node:Prerequisite={status:major&&Number(major[1])>=20?'ready':'unsupported',version};
 if(node.status!=='ready'){required.push('node');steps.push('Install Node 20 or newer and make node available to PowerShell and native Codex hooks.');}
 const platform:Prerequisite={status:(options.platform??process.platform)==='win32'?'ready':'unsupported'};
 if(platform.status!=='ready'){required.push('platform');steps.push('Run the HUD host in native Windows PowerShell.');}
 let configValid=options.configValid!==false;try{validateConfig(config);}catch{configValid=false;}
 const configuration:Prerequisite={status:configValid?'valid':'invalid'};
 if(configuration.status!=='valid'){required.push('configuration');steps.push('Repair the HUD configuration before applying setup.');}
 const backend=get(config,'host.psmuxPath'),psmux:Prerequisite={status:'missing',path:typeof backend==='string'?effectiveBackendPath(backend):''};
 if(psmux.path){
  if(!path.isAbsolute(psmux.path))psmux.status='invalid-path';
  else if((deps.isFile??isFile)(psmux.path)){
   try{
    const output=(deps.version??(file=>execFileSync(file,['-V'],{encoding:'utf8',windowsHide:true,timeout:3000,maxBuffer:4096,stdio:['ignore','pipe','pipe']})))(psmux.path).trim();
    psmux.version=output.slice(0,200);psmux.status=verifyBackend(psmux.path,output)?'ready':'unsupported-version';
   }catch{psmux.status='probe-failed';}
  }
 }
 if(psmux.status!=='ready'){required.push('psmux');steps.push('Set host.psmuxPath to verified portable psmux 3.4.0 build 20aa1d7 or the packaged checksum-pinned compact backend. Verify the fixed release ZIP SHA256 before extraction.');}
 const codex:Prerequisite={status:'missing'};
 try{
  const command=options.officialCommand??(deps.findCodex??findCodex)();
  if(command){
   codex.path=command;
   if(!path.isAbsolute(command)||!(deps.isFile??isFile)(command))codex.status='missing';
   else{
    const resolved=(deps.resolveCodex??resolveOfficial)(command);
    codex.status='ready';codex.kind=resolved.prefix.length?'npm':'native';
   }
  }
 }catch{codex.status='unsupported';}
 if(codex.status!=='ready'){required.push('codex');steps.push('Install or select the original official Codex native executable or @openai/codex npm launcher; unsupported wrappers require an explicit supported path.');}
 steps.push('Prerequisites: native Windows, Node 20+, and the pinned portable psmux release.');
 steps.push('Review setup for each PowerShell 5/7 profile in use, then open a new shell to load it.');
 steps.push('Review the current SessionStart hook through native Codex /hooks; trust is unknown to this diagnostic.');
 const autoStart=String(get(config,'host.autoStart')??'inherit'),legacyEnabled=!!get(config,'startup.enabled'),effectiveEnabled=startupEnabled(config);
 if(legacyEnabled)steps.push('For coexistence with older 0.3.4 sessions, keep startup.enabled=false and explicitly enable host.autoStart only when setup is ready.');
 if(!effectiveEnabled)steps.push('Automatic HUD opening is paused by the saved startup preferences; enable it explicitly after setup when desired.');
 steps.push('Verify independent HUD pairing and interaction in real Codex sessions; runtime checks do not establish interactive acceptance.');
 return {ready:required.length===0,scope:'runtime-prerequisites-only',required,steps,prerequisites:{node,platform,psmux,codex,configuration},preferences:{autoStart,legacyEnabled,effectiveEnabled},hookTrust:'unknown',interactiveAcceptance:'unverified'};
}
