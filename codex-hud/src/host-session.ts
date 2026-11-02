import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {configPath,get,type Config} from './config.js';
import {createLaunch,readLaunch,updateLaunch,requestStop,type LaunchDescriptor} from './runtime.js';
import {PsmuxClient,readHostOrigin,readProcessFacts,verifyHost,hostIdPattern,samePath,type HostProof,type HostDependencies,type ProcessFact} from './psmux.js';
import {acquireStartupLock} from './startup-lock.js';
import {planInitialPaneSize} from './pane-size.js';
import {emptySnapshot} from './types.js';

export interface HostRecord {kind:'mz-hud-host/1';id:string;file:string;proof:HostProof;cwd:string;createdAt:string;state:'running'|'closed';launchFile?:string;exitCode?:number}
export interface HostDisplayOptions {dependencies?:HostDependencies;role?:'owner'|'hook';waitMs?:number;configFile?:string;binding?:{id:string;transcript:string};dryRun?:boolean}
export interface HostDisplayResult {status:'opened'|'already-open'|'busy'|'stopping';launchFile?:string}
function atomic(file:string,value:unknown):void {
 const temp=file+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}
}
function fact(value:ProcessFact):ProcessFact{return {pid:value.pid,parentPid:value.parentPid,name:value.name,startedAt:value.startedAt};}
export function registerHost(proof:HostProof,root=proof.origin.hostDir,cwd=process.cwd()):HostRecord {
 if(!samePath(root,proof.origin.hostDir)||!hostIdPattern.test(proof.origin.originId))throw new Error('Invalid host registration path');
 fs.mkdirSync(root,{recursive:true,mode:0o700});if(fs.lstatSync(root).isSymbolicLink())throw new Error('Host registry cannot be a symbolic link');
 const file=path.resolve(root,proof.origin.originId+'.json');if(fs.existsSync(file))throw new Error('Host origin already registered');
 const origin=proof.origin;
 const record:HostRecord={kind:'mz-hud-host/1',id:origin.originId,file,proof:{origin:{binary:origin.binary,dataDir:origin.dataDir,hostDir:origin.hostDir,namespace:origin.namespace,tmux:origin.tmux,session:origin.session,pane:origin.pane,originId:origin.originId},owner:fact(proof.owner),server:fact(proof.server),window:proof.window},cwd:path.resolve(cwd),createdAt:new Date().toISOString(),state:'running'};
 atomic(file,record);return record;
}
export function readHost(file:string):HostRecord {
 if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>32768)throw new Error('Invalid host registration file');
 const value=JSON.parse(fs.readFileSync(file,'utf8')) as HostRecord;
 if(value.kind!=='mz-hud-host/1'||!hostIdPattern.test(value.id)||path.basename(file)!==value.id+'.json'||!samePath(value.file,file)||!value.proof?.origin||value.proof.origin.originId!==value.id||!samePath(path.dirname(file),value.proof.origin.hostDir)||!path.isAbsolute(value.cwd)||!['running','closed'].includes(value.state))throw new Error('Invalid host registration');
 if(value.launchFile&&(!samePath(path.dirname(value.launchFile),path.dirname(path.dirname(file)))||!hostIdPattern.test(path.basename(value.launchFile,'.json'))))throw new Error('Invalid host display reference');
 return value;
}
export function loadCurrentHost(role:'hook'|'owner'='hook',dependencies:HostDependencies={},env:NodeJS.ProcessEnv=process.env):HostRecord {
 const origin=readHostOrigin(env),record=readHost(path.join(origin.hostDir,origin.originId+'.json')),expected=record.proof.origin;
 for(const key of ['namespace','tmux','session','pane','originId'] as const)if(origin[key]!==expected[key])throw new Error('Current host origin contradicts its source registration');
 for(const key of ['binary','dataDir','hostDir'] as const)if(!samePath(origin[key],expected[key]))throw new Error('Current host paths contradict its source registration');
 if(record.state!=='running')throw new Error('Source host has already closed');
 verifyHost(record.proof,role,dependencies);return record;
}
function ownedDisplay(record:HostRecord,d:LaunchDescriptor):void {
 if(!d.host||!samePath(d.host.recordFile,record.file)||d.host.proof.origin.originId!==record.id||d.host.proof.owner.pid!==record.proof.owner.pid||d.host.proof.owner.startedAt!==record.proof.owner.startedAt||d.host.proof.server.startedAt!==record.proof.server.startedAt)throw new Error('Display does not belong to this exact host');
}
function applyBinding(file:string,binding:HostDisplayOptions['binding']):void {
 if(binding)updateLaunch(file,d=>{d.sessionId=binding.id;d.transcriptPath=binding.transcript;});
}
export async function ensureHostDisplay(input:HostRecord,config:Config,options:HostDisplayOptions={}):Promise<HostDisplayResult> {
 const dependencies=options.dependencies??{},release=await acquireStartupLock(path.join(input.proof.origin.hostDir,'.locks',input.id));if(!release)return {status:'busy'};
 try{
  const record=readHost(input.file);if(record.state!=='running')throw new Error('Source host has closed');
  verifyHost(record.proof,options.role??'owner',dependencies);const client=new PsmuxClient(record.proof.origin,dependencies);
  if(record.launchFile){
   const d=readLaunch(record.launchFile);ownedDisplay(record,d);
   const expected=d.host!.hudProcess,actual=expected?(dependencies.processes??readProcessFacts)([expected.pid],dependencies.pid??process.pid).find(p=>p.pid===expected.pid):undefined;
   const live=actual&&expected&&actual.startedAt===expected.startedAt&&actual.name===expected.name;
   if(live){
    if(d.state==='exited'||d.hudStop)return {status:'stopping',launchFile:d.file};
    const pane=client.pane(d.host!.hudPane??'');if(pane.pid!==expected!.pid||pane.window!==record.proof.window)throw new Error('Existing HUD pane incarnation changed');
    applyBinding(d.file,options.binding);return {status:'already-open',launchFile:d.file};
   }
   if(!expected&&d.state!=='exited')throw new Error('HUD creation is pending or uncertain; inspect the exact host before retrying');
  }
  if(options.dryRun)return {status:'already-open'};
  const pane=client.pane(record.proof.origin.pane);if(pane.height<12)throw new Error('Source pane is too short to keep Codex and its HUD visible');
  const sizing=planInitialPaneSize(config,emptySnapshot('pending'),{columns:pane.width,rows:pane.height});
  const rows=Math.max(2,Math.min(pane.height-11,Math.floor(pane.height*get(config,'terminal.paneSize')),sizing.contentRows===undefined?pane.height:sizing.contentRows+1));
  const display=createLaunch(record.cwd,config,path.dirname(record.proof.origin.hostDir),options.configFile??configPath());
  updateLaunch(display.file,d=>{d.host={recordFile:record.file,proof:record.proof,phase:'opening'};d.initialSizing=sizing;if(options.binding){d.sessionId=options.binding.id;d.transcriptPath=options.binding.transcript;}});
  record.launchFile=display.file;atomic(record.file,record);
  try{
   // Publish the intent before the command. A timeout never proves that no pane was created.
   const hudPane=client.split(rows,display.file),deadline=Date.now()+(options.waitMs??4000);
   do{
    const current=readLaunch(display.file);
    if(current.state==='running'&&current.host?.hudProcess&&current.host.hudPane===hudPane){
     const hud=client.pane(hudPane),processes=(dependencies.processes??readProcessFacts)([current.host.hudProcess.pid],dependencies.pid??process.pid),actual=processes.find(p=>p.pid===current.host!.hudProcess!.pid);
     if(hud.pid!==current.pid||hud.window!==record.proof.window||actual?.startedAt!==current.host.hudProcess.startedAt)throw new Error('HUD did not prove its process/pane incarnation');
     verifyHost(record.proof,options.role??'owner',dependencies);applyBinding(current.file,options.binding);return {status:'opened',launchFile:current.file};
    }
    if(Date.now()>=deadline)break;await delay(50);
   }while(true);
   throw new Error('HUD launch acknowledgement timed out; creation is uncertain');
  }catch(error){updateLaunch(display.file,d=>{if(d.host)d.host.phase='uncertain';});throw error;}
 }finally{release();}
}
export async function bindHostSession(record:HostRecord,sessionId:string,transcriptPath:string,options:HostDisplayOptions&{config:Config}):Promise<HostDisplayResult> {
 if(!/^[a-zA-Z0-9_-]{3,100}$/.test(sessionId)||!path.isAbsolute(transcriptPath))throw new Error('Invalid host session identity');
 return ensureHostDisplay(record,options.config,{...options,binding:{id:sessionId,transcript:transcriptPath}});
}
export function acknowledgeViewer(file:string):void {
 const d=readLaunch(file);if(!d.host)throw new Error('Viewer has no exact host binding');
 const record=readHost(d.host.recordFile);ownedDisplay(record,d);if(record.state!=='running'||!record.launchFile||!samePath(record.launchFile,file))throw new Error('Viewer intent is no longer current');
 const origin=readHostOrigin();for(const key of ['originId','namespace','tmux','session'] as const)if(origin[key]!==record.proof.origin[key])throw new Error('Viewer inherited a different host origin');
 verifyHost(record.proof,'viewer');const physical=new PsmuxClient(record.proof.origin).pane(origin.pane),own=readProcessFacts([process.pid]).find(p=>p.pid===process.pid);
 if(origin.pane===record.proof.origin.pane||physical.pid!==process.pid||physical.window!==record.proof.window||!own)throw new Error('Viewer process does not own its HUD pane');
 updateLaunch(file,value=>{value.pid=process.pid;value.state='running';value.heartbeat=Date.now();value.host!.hudPane=origin.pane;value.host!.hudProcess=own;value.host!.phase='running';});
}
export function closeHost(input:HostRecord,exitCode:number):void {
 const record=readHost(input.file);if(record.proof.owner.pid!==input.proof.owner.pid||record.proof.owner.startedAt!==input.proof.owner.startedAt)throw new Error('Cannot close a different source incarnation');
 record.state='closed';record.exitCode=exitCode;atomic(record.file,record);
 if(record.launchFile){const d=readLaunch(record.launchFile);ownedDisplay(record,d);if(d.state!=='exited')requestStop(d.file);}
}
