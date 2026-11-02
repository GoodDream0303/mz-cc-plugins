import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {get,loadConfig,configPath} from './config.js';
import {codexHome} from './sessions.js';
import {buildTerminalArgs,createLaunch,readLaunch,runtimeRoot,updateLaunch,type LaunchDescriptor} from './runtime.js';
import {acquireStartupLock,processIsLive} from './startup-lock.js';
type HookEvent=Record<string,unknown>;
export interface AutostartOptions {configFile?:string;runtimeDir?:string;launch?:(display:LaunchDescriptor,window:string)=>void|Promise<void>}
export interface AutostartResult {status:'opened'|'already-open'|'disabled'|'ignored'|'busy';reason?:string}
const idPattern=/^[a-zA-Z0-9_-]{3,100}$/;
async function metadata(file:string):Promise<Record<string,any>|undefined>{
 let handle;
 try{
  handle=await fsp.open(file,'r');const chunks:Buffer[]=[];let size=0;const buffer=Buffer.alloc(65536);
  while(size<2*1024*1024){
   const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,2*1024*1024-size),size);if(!bytesRead)return;
   const piece=buffer.subarray(0,bytesRead),end=piece.indexOf(10);chunks.push(Buffer.from(end<0?piece:piece.subarray(0,end)));size+=bytesRead;
   if(end>=0){const row=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));return row.type==='session_meta'&&row.payload&&typeof row.payload==='object'?row.payload:undefined;}
  }
 }catch{/* metadata may still be written at SessionStart */}finally{await handle?.close();}
}
function canonical(value:string):string{const result=path.resolve(value);return process.platform==='win32'?result.toLowerCase():result;}
function activeDisplay(root:string,id:string,home:string):LaunchDescriptor|undefined{
 for(const name of fs.readdirSync(root)){
  if(!/^[a-f0-9-]{36}\.json$/i.test(name))continue;
  try{
   const d=readLaunch(path.join(root,name));if(d.demo||d.sessionId!==id||canonical(d.codexHome)!==canonical(home)||d.hudStop||d.state==='exited')continue;
   if(d.state==='created'&&Date.now()-Date.parse(d.createdAt)<15000)return d;
   if(d.state==='running'&&Number.isInteger(d.pid)&&d.pid!>0&&processIsLive(d.pid!)!==false)return d;
  }catch{/* unrelated, stale or malformed owned metadata is not a live display */}
 }
}
export async function autoStart(event:HookEvent,options:AutostartOptions={}):Promise<AutostartResult>{
 if(event.hook_event_name!=='SessionStart'||!['startup','resume'].includes(String(event.source))||event.agent_id||event.subagent_id||event.agent_transcript_path)return {status:'ignored',reason:'not-main-start'};
 if(process.platform!=='win32')return {status:'ignored',reason:'not-windows'};
 const file=options.configFile??configPath(),config=loadConfig(file);if(!get(config,'startup.enabled'))return {status:'disabled'};
 if(typeof event.session_id!=='string'||!idPattern.test(event.session_id)||typeof event.transcript_path!=='string'||!path.isAbsolute(event.transcript_path))return {status:'ignored',reason:'missing-transcript'};
 let meta:Record<string,any>|undefined;
 const deadline=Date.now()+2000;
 do{meta=await metadata(event.transcript_path);if(meta)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
 if(!meta)return {status:'ignored',reason:'metadata-unavailable'};
 if(meta.source!=='cli')return {status:'ignored',reason:'not-cli-main'};
 if(typeof meta.id!=='string'||!idPattern.test(meta.id)||event.session_id!==meta.id&&event.session_id!==meta.session_id||typeof meta.cwd!=='string')return {status:'ignored',reason:'identity-mismatch'};
 const home=codexHome(),root=options.runtimeDir??runtimeRoot();fs.mkdirSync(root,{recursive:true});
 const key=createHash('sha256').update(canonical(home)+'\0'+meta.id).digest('hex'),lock=path.join(root,'.autostart-'+key+'.lock');
 const release=await acquireStartupLock(lock);if(!release)return {status:'busy'};
 try{
  const active=activeDisplay(root,meta.id,home);
  if(active){if(active.transcriptPath!==event.transcript_path)updateLaunch(active.file,d=>{d.transcriptPath=event.transcript_path as string;});return {status:'already-open'};}
  const d=createLaunch(meta.cwd,config,root,file);updateLaunch(d.file,value=>{value.sessionId=meta!.id;value.transcriptPath=event.transcript_path as string;});
  const display=readLaunch(d.file);
  try{await (options.launch??((value,window)=>{execFileSync('wt.exe',buildTerminalArgs(value,window),{windowsHide:false,stdio:'ignore',timeout:10000});}))(display,get(config,'startup.window'));return {status:'opened'};}
  catch(error){updateLaunch(d.file,value=>{value.state='exited';value.exitCode=1;});throw error;}
 }finally{release();}
}
export async function runAutostartHook():Promise<void>{
 let status='failed',reason='startup-failed';
 try{
  process.stdin.setEncoding('utf8');let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>1024*1024)throw new Error('Hook input too large');}
  const result=await autoStart(JSON.parse(input));status=result.status;reason=result.reason??'';
 }catch{process.stderr.write('Codex HUD autostart failed; run mz-codex-hud doctor.\n');}
 try{
  const root=runtimeRoot();fs.mkdirSync(root,{recursive:true});const file=path.join(root,'autostart-status.json'),temp=path.join(root,'.autostart-status-'+randomUUID()+'.tmp');
  try{fs.writeFileSync(temp,JSON.stringify({at:new Date().toISOString(),status,reason}),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}
 }catch{/* diagnostics must not interfere with Codex startup */}
}
