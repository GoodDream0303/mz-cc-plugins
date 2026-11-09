import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {effectiveBackendPath} from './backend-version.js';

export interface ProcessFact {pid:number;parentPid:number;name:string;startedAt:string}
export interface HostOrigin {binary:string;dataDir:string;hostDir:string;namespace:string;tmux:string;session:string;pane:string;originId:string}
export interface HostProof {origin:HostOrigin;owner:ProcessFact;server:ProcessFact;window:string;frontend?:ProcessFact}
export interface PaneFact {session:string;window:string;pane:string;pid:number;width:number;height:number;serverPid:number}
export interface HostDependencies {pid?:number;run?:(args:string[])=>string;processes?:(pids:number[],rootPid:number)=>ProcessFact[]}
export const hostIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const panePattern=/^%[1-9]\d*$/;
const positive=(value:number)=>Number.isSafeInteger(value)&&value>0;
const canonical=(value:string)=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
export function samePath(a:string,b:string):boolean{return canonical(a)===canonical(b);}
export function serverPid(origin:HostOrigin):number {
 const match=/^\/tmp\/psmux-([1-9]\d*)\/([a-zA-Z0-9_-]{1,80}),([1-9]\d*),\d+$/.exec(origin.tmux);
 if(!match||match[2]!==origin.namespace||!positive(Number(match[1]))||Number(match[3])>65535)throw new Error('Host namespace and endpoint do not match');
 return Number(match[1]);
}
export function readHostOrigin(env:NodeJS.ProcessEnv=process.env):HostOrigin {
 const origin:HostOrigin={binary:env.MZ_HUD_PSMUX??'',dataDir:env.PSMUX_DATA_DIR??'',hostDir:env.MZ_HUD_HOST_DIR??'',namespace:env.MZ_HUD_NAMESPACE??'',tmux:env.TMUX??'',session:env.PSMUX_SESSION??'',pane:env.TMUX_PANE??'',originId:env.MZ_HUD_ORIGIN??''};
 if(![origin.binary,origin.dataDir,origin.hostDir].every(value=>value&&path.isAbsolute(value)))throw new Error('Exact HUD host requires absolute binary, data and host paths');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(origin.namespace)||!serverPid(origin))throw new Error('Invalid host namespace or endpoint');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(origin.session)||!panePattern.test(origin.pane)||!hostIdPattern.test(origin.originId))throw new Error('Exact host origin or source pane is missing');
 if(env.PSMUX_SERVER_MODE?.toLowerCase()==='shared')throw new Error('Shared psmux server mode has not been validated');
 return origin;
}
export function readProcessFacts(pids:number[],rootPid=process.pid):ProcessFact[] {
 return queryProcessFacts(pids,rootPid,false);
}
/** Explicit identities only; never use this result to establish hook ancestry. */
export function readProcessIdentities(pids:number[]):ProcessFact[] {
 return queryProcessFacts(pids,process.pid,true);
}
function queryProcessFacts(pids:number[],rootPid:number,identitiesOnly:boolean):ProcessFact[] {
 if(process.platform!=='win32')throw new Error('Native Windows process identity is required');
 if(![rootPid,...pids].every(positive))throw new Error('Invalid process identity');
 const helper=fileURLToPath(new URL('../bin/process-facts.ps1',import.meta.url));
 const raw=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',helper,'-RootPid',String(rootPid),'-Ids',pids.join(','),...(identitiesOnly?['-IdentitiesOnly']:[])],{encoding:'utf8',windowsHide:true,timeout:6000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
 const value=JSON.parse(raw.replace(/^\uFEFF/,''));
 if(!Array.isArray(value)||value.length>128||!value.every(validFact))throw new Error('Process identity snapshot is invalid');
 return value;
}
function validFact(value:any):value is ProcessFact{return !!value&&positive(value.pid)&&Number.isSafeInteger(value.parentPid)&&value.parentPid>=0&&typeof value.name==='string'&&value.name.length<260&&typeof value.startedAt==='string'&&Number.isFinite(Date.parse(value.startedAt));}
function sameProcess(actual:ProcessFact|undefined,expected:ProcessFact):boolean{return !!actual&&validFact(expected)&&actual.pid===expected.pid&&actual.startedAt===expected.startedAt&&actual.name.toLowerCase()===expected.name.toLowerCase()&&actual.parentPid===expected.parentPid;}
export class PsmuxClient {
 constructor(readonly origin:HostOrigin,private readonly dependencies:HostDependencies={}) {serverPid(origin);}
 private command(args:string[]):string {
  const argv=['-L',this.origin.namespace,...args];if(this.dependencies.run)return this.dependencies.run(argv);
  const env={...process.env,TMUX:this.origin.tmux,TMUX_PANE:this.origin.pane,PSMUX_SESSION:this.origin.session,PSMUX_DATA_DIR:this.origin.dataDir};
  for(const key of ['PSMUX_TARGET_SESSION','PSMUX_TARGET_FULL','PSMUX_SESSION_NAME','PSMUX_ROUTE_WARM'])delete env[key as keyof typeof env];
  const binary=effectiveBackendPath(this.origin.binary);
  if(!binary)throw new Error('A verified packaged backend is required for this host');
  return execFileSync(binary,argv,{env,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
 }
 pane(id:string):PaneFact {
  if(!panePattern.test(id))throw new Error('Invalid exact pane target');
  const values=this.command(['display-message','-p','-t',id,'#{session_name}\t#{window_id}\t#{pane_id}\t#{pane_pid}\t#{pane_width}\t#{pane_height}\t#{pid}']).trim().split('\t');
  const [session,window,pane,pid,width,height,server]=values;
  const facts:PaneFact={session,window,pane,pid:Number(pid),width:Number(width),height:Number(height),serverPid:Number(server)};
  if(values.length!==7||pane!==id||session!==this.origin.session||!/^@\d+$/.test(window)||!positive(facts.pid)||facts.serverPid!==serverPid(this.origin)||!positive(facts.width)||!positive(facts.height))throw new Error('Physical pane does not match its source server/session endpoint');
  return facts;
 }
 split(rows:number,launchFile:string):string {
  if(!Number.isInteger(rows)||rows<1||rows>1000)throw new Error('Invalid HUD pane height');
  const entry=fileURLToPath(new URL('../bin/hud.mjs',import.meta.url));
  const result=this.command(['split-window','-v','-d','-t',this.origin.pane,'-l',String(rows),'-P','-F','#{pane_id}','--',process.execPath,entry,'watch','--launch64',Buffer.from(path.resolve(launchFile)).toString('base64')]).trim();
  if(result===this.origin.pane)throw new Error('Backend returned the source owner as its HUD pane; creation is uncertain');
  if(!panePattern.test(result))throw new Error('Backend did not return a distinct HUD pane; creation is uncertain');
  return result;
 }
 panes():PaneFact[] {
  const raw=this.command(['list-panes','-a','-F','#{session_name}\t#{window_id}\t#{pane_id}\t#{pane_pid}\t#{pane_width}\t#{pane_height}\t#{pid}']).trim();
  const panes=raw?raw.split(/\r?\n/).map(line=>{
   const values=line.split('\t'),[session,window,pane,pid,width,height,server]=values;
   if(values.length!==7||session!==this.origin.session||!/^@\d+$/.test(window)||!panePattern.test(pane)||![pid,width,height].every(value=>positive(Number(value)))||Number(server)!==serverPid(this.origin))throw new Error('Pane scope does not match the source server');
   return {session,window,pane,pid:Number(pid),width:Number(width),height:Number(height),serverPid:Number(server)};
  }):[];
  if(new Set(panes.map(p=>p.pane)).size!==panes.length)throw new Error('Source pane scope is ambiguous');
  return panes;
 }
 resizePane(id:string,rows:number):void {
  if(!panePattern.test(id)||id===this.origin.pane)throw new Error('Only a distinct HUD pane can be resized');
  if(!Number.isInteger(rows)||rows<1||rows>1000)throw new Error('Invalid HUD pane height');
  this.command(['resize-pane','-t',id,'-y',String(rows)]);
 }
 confirmsAbsent(id:string,ownerPid:number):boolean {
  if(!panePattern.test(id)||id===this.origin.pane)throw new Error('Invalid HUD recovery pane');
  const raw=this.command(['list-panes','-a','-F','#{session_name}\t#{window_id}\t#{pane_id}\t#{pane_pid}\t#{pane_width}\t#{pane_height}\t#{pid}']).trim();
  const rows=raw?raw.split(/\r?\n/).map(row=>row.split('\t')):[];
  if(!rows.length||rows.some(row=>row.length!==7||row[0]!==this.origin.session||!/^@\d+$/.test(row[1])||!panePattern.test(row[2])||!positive(Number(row[3]))||Number(row[6])!==serverPid(this.origin))||!rows.some(row=>row[2]===this.origin.pane&&Number(row[3])===ownerPid))throw new Error('Backend cannot establish exact source scope for HUD recovery');
  return !rows.some(row=>row[2]===id);
 }
}
export function proveOwner(origin:HostOrigin,dependencies:HostDependencies={}):HostProof {
 const pid=dependencies.pid??process.pid,physical=new PsmuxClient(origin,dependencies).pane(origin.pane);
 if(physical.pid!==pid)throw new Error('Bootstrap is not the source pane owner process');
 const processes=(dependencies.processes??readProcessFacts)([physical.serverPid],pid),owner=processes.find(p=>p.pid===pid),server=processes.find(p=>p.pid===physical.serverPid);
 if(!owner||!server||!validFact(owner)||!validFact(server)||!['psmux.exe','tmux.exe','pmux.exe'].includes(server.name.toLowerCase())||Date.parse(server.startedAt)>Date.parse(owner.startedAt))throw new Error('Source owner/server process incarnation is unavailable');
 return {origin,owner,server,window:physical.window};
}
export function verifyHost(proof:HostProof,role:'owner'|'hook'|'viewer'|'frontend',dependencies:HostDependencies={}):HostProof {
 const pid=dependencies.pid??process.pid,physical=new PsmuxClient(proof.origin,dependencies).pane(proof.origin.pane);
 const values=(dependencies.processes??readProcessFacts)([proof.owner.pid,proof.server.pid,...(proof.frontend?[proof.frontend.pid]:[])],pid),table=new Map(values.map(p=>[p.pid,p]));
 if(physical.pid!==proof.owner.pid||physical.window!==proof.window||physical.serverPid!==proof.server.pid||!sameProcess(table.get(proof.owner.pid),proof.owner)||!sameProcess(table.get(proof.server.pid),proof.server))throw new Error('Source owner/server process incarnation changed');
 if(role==='owner'&&pid!==proof.owner.pid)throw new Error('Current process does not own this source pane');
 if(role==='frontend'&&(table.get(pid)?.parentPid!==proof.owner.pid||pid===proof.owner.pid))throw new Error('Frontend entry must be a direct child of the registered source');
 if(role==='hook'){
  if(!proof.frontend)throw Object.assign(new Error('Official frontend registration is pending'),{code:'ERR_HUD_FRONTEND_PENDING'});
  if(proof.frontend.parentPid!==proof.owner.pid||!sameProcess(table.get(proof.frontend.pid),proof.frontend))throw new Error('Registered official frontend incarnation is unavailable');
  let current=table.get(pid),reached=false,frontend=false;const seen=new Set<number>(),codex:ProcessFact[]=[];
  for(let depth=0;depth<64&&current&&!seen.has(current.pid);depth++){
   seen.add(current.pid);if(current.name.toLowerCase()==='codex.exe')codex.push(current);if(current.pid===proof.frontend.pid)frontend=true;
   if(current.pid===proof.owner.pid){reached=true;break;}
   const parent=table.get(current.parentPid);if(!parent||Date.parse(parent.startedAt)>Date.parse(current.startedAt))break;current=parent;
  }
  if(!reached||!frontend||codex.length!==1||(proof.frontend.name.toLowerCase()==='codex.exe'?codex[0].pid!==proof.frontend.pid:codex[0].parentPid!==proof.frontend.pid))throw new Error('Ambiguous frontend/daemon ancestry cannot prove this hook origin');
 }
 return proof;
}
