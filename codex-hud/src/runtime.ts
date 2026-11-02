import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';
import {get,configPath,loadConfig,type Config} from './config.js';
import {codexHome} from './sessions.js';
import {inspectHookSetup,type HookSetup} from './doctor.js';
export interface LaunchDescriptor {
 kind:'mz-codex-hud/1';id:string;file:string;cwd:string;codexHome:string;configFile:string;createdAt:string;
 state:'created'|'running'|'exited';sessionId?:string;transcriptPath?:string;heartbeat?:number;pid?:number;
 exitCode?:number;hudStop?:boolean;paneSize:number;channel:string;channelToken:string;demo?:boolean;demoDurationMs?:number;
}
export interface Command {command:string;args:string[];isolated?:boolean}
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function runtimeRoot():string{return path.join(path.dirname(configPath()),'runtime');}
function write(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
export function createLaunch(cwd:string,config:Config,root=runtimeRoot(),configFile=configPath()):LaunchDescriptor{
 const id=randomUUID();fs.mkdirSync(root,{recursive:true});const file=path.resolve(root,id+'.json');
 const d:LaunchDescriptor={kind:'mz-codex-hud/1',id,file,cwd:path.resolve(cwd),codexHome:codexHome(),configFile:path.resolve(configFile),createdAt:new Date().toISOString(),state:'created',paneSize:get(config,'terminal.paneSize'),channel:process.platform==='win32'?'\\\\.\\pipe\\mz-codex-hud-'+id:path.join(os.tmpdir(),'mz-hud-'+id+'.sock'),channelToken:randomUUID()};
 write(file,d);return d;
}
export function readLaunch(file:string):LaunchDescriptor{
 if(fs.lstatSync(file).isSymbolicLink())throw new Error('Launch descriptors cannot be symbolic links');
 const stat=fs.statSync(file);if(stat.size>65536)throw new Error('Invalid launch descriptor');
 const d=JSON.parse(fs.readFileSync(file,'utf8')) as LaunchDescriptor;
 if(d.kind!=='mz-codex-hud/1'||!guid.test(d.id)||path.basename(file)!==d.id+'.json'||path.resolve(d.file)!==path.resolve(file)||typeof d.cwd!=='string'||typeof d.configFile!=='string'||typeof d.codexHome!=='string'||!['created','running','exited'].includes(d.state))throw new Error('Invalid launch descriptor');
 return d;
}
export function updateLaunch(file:string,change:(d:LaunchDescriptor)=>void):LaunchDescriptor{
 const lock=file+'.lock';const deadline=Date.now()+1000;
 for(;;){try{fs.mkdirSync(lock);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||Date.now()>deadline)throw new Error('Launch metadata busy; retry or run doctor');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
 try{const d=readLaunch(file);change(d);write(file,d);return d;}finally{fs.rmdirSync(lock);}
}
export function bindLaunch(file:string,event:any):boolean{
 let bound=false;
 updateLaunch(file,d=>{
  if(d.state==='exited'||event.agent_id||event.subagent_id||typeof event.session_id!=='string'||!/^[a-z0-9-]{3,100}$/i.test(event.session_id)||typeof event.cwd!=='string')return;
  const canonical=(v:string)=>process.platform==='win32'?path.resolve(v).toLowerCase():path.resolve(v);
  if(canonical(event.cwd)!==canonical(d.cwd)||d.sessionId&&d.sessionId!==event.session_id)return;
  d.sessionId=event.session_id;
  if(typeof event.transcript_path==='string')d.transcriptPath=event.transcript_path;
  bound=true;
 });return bound;
}
export function requestStop(file:string):void{updateLaunch(file,d=>{d.hudStop=true;});}
export function validateCodexArgs(args:string[]):void{
 if(args.some(a=>a==='--remote'||a.startsWith('--remote=')))throw new Error('Remote sessions are unsupported: run watch --session on the Codex host');
 if(args.some(a=>a==='-C'||a==='--cd'||a.startsWith('--cd=')||a==='--worktree'))throw new Error('Choose the launch directory with HUD --cwd; changing cwd inside Codex prevents exact binding');
 if(args.some(a=>a.includes('\0')))throw new Error('Invalid NUL in argv');
}
export function decodeArgs(encoded:string):string[]{
 try{if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw 0;const value=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));if(!Array.isArray(value)||!value.every(v=>typeof v==='string')||value.length>500)throw 0;return value;}catch{throw new Error('Invalid encoded argv');}
}
export function buildTerminalArgs(d:LaunchDescriptor,args:string[]):string[]{
 validateCodexArgs(args);
 const entry=pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'cli.js')).href;
 // Windows Terminal sees only generated ASCII payloads, never user arguments as action separators.
 const boot="import(Buffer.from(process.argv[1],'base64').toString()).then(m=>m.main(process.argv.slice(2))).catch(e=>{console.error(e.message),process.exitCode=1})";
 const shared=[process.execPath,'-e',boot,Buffer.from(entry).toString('base64')];
 const launch64=Buffer.from(d.file).toString('base64');
 const command=['-w','mz-codex-hud-'+d.id,'new-tab','--title',d.demo?'Codex HUD Preview '+d.id.slice(0,8):'Codex','--suppressApplicationTitle',...shared,'runner','--launch64',launch64,'--argv',Buffer.from(JSON.stringify(args)).toString('base64'),';','split-pane','--horizontal','--size',String(d.paneSize),'--title','Codex HUD','--suppressApplicationTitle',...shared,'watch','--launch64',launch64,';','focus-pane','-t','0'];
 if(command.join(' ').length>28000)throw new Error('Command arguments too long for Windows Terminal');return command;
}
export function resolveCodex(environment:NodeJS.ProcessEnv=process.env,cwd=process.cwd()):Command{
 const pathKey=Object.keys(environment).find(key=>key.toUpperCase()==='PATH');
 const dirs=(pathKey?environment[pathKey]??'':'').split(path.delimiter).filter(Boolean).map(dir=>path.resolve(cwd,dir));
 for(const dir of dirs){
  const script=path.join(dir,'node_modules','@openai','codex','bin','codex.js');
  if(fs.existsSync(script))return {command:process.execPath,args:[script]};
  const exe=path.join(dir,process.platform==='win32'?'codex.exe':'codex');
  if(fs.existsSync(exe)&&!exe.endsWith('.cmd'))return {command:exe,args:[]};
 }
 throw new Error('Original Codex CLI was not found; install Codex and verify it is on PATH');
}
export async function serveEnvironment(d:LaunchDescriptor):Promise<{delivered:Promise<void>;close:()=>void}>{
 let resolveDelivery!:()=>void,rejectDelivery!:(e:Error)=>void;let delivered=false;
 const delivery=new Promise<void>((resolve,reject)=>{resolveDelivery=resolve;rejectDelivery=reject;});
 // Retain secrets only in this process and the one-shot local pipe; never on disk or in argv.
 const server=net.createServer(socket=>{
  let input='';socket.setEncoding('utf8');socket.setTimeout(5000,()=>socket.destroy());
  socket.on('data',chunk=>{input+=chunk;if(input.length>1024){socket.destroy();return;}if(!input.includes('\n'))return;
   if(input.trim()!==d.channelToken||delivered){socket.destroy();return;}delivered=true;
   socket.end(JSON.stringify(process.env));resolveDelivery();server.close();
  });socket.on('error',()=>{});
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(d.channel,resolve);});
 const timer=setTimeout(()=>{server.close();rejectDelivery(new Error('Terminal runner did not connect within 30s'));},30000);
 delivery.finally(()=>clearTimeout(timer)).catch(()=>{});
 return {delivered:delivery,close:()=>{clearTimeout(timer);server.close();}};
}
export async function receiveEnvironment(d:LaunchDescriptor):Promise<NodeJS.ProcessEnv>{
 return new Promise((resolve,reject)=>{
  const socket=net.connect(d.channel);let data='';socket.setEncoding('utf8');socket.setTimeout(10000,()=>socket.destroy(new Error('Launch environment timeout')));
  socket.on('connect',()=>socket.write(d.channelToken+'\n'));
  socket.on('data',chunk=>{data+=chunk;if(data.length>1024*1024)socket.destroy(new Error('Launch environment too large'));});
  socket.on('error',reject);socket.on('end',()=>{try{const env=JSON.parse(data);if(!env||typeof env!=='object'||Array.isArray(env)||!Object.values(env).every(v=>typeof v==='string'))throw new Error('Invalid launch environment');resolve(env);}catch(e){reject(e);}});
 });
}
export async function runCodex(d:LaunchDescriptor,args:string[],command:Command|undefined=undefined,environment:NodeJS.ProcessEnv=process.env):Promise<number>{
 validateCodexArgs(args);
 updateLaunch(d.file,value=>{value.state='running';value.pid=process.pid;value.heartbeat=Date.now();});
 const heartbeat=setInterval(()=>{try{updateLaunch(d.file,v=>{v.heartbeat=Date.now();});}catch{}},2000);
 const ignoreInterrupt=()=>{};process.on('SIGINT',ignoreInterrupt);
 try{
  const selectedCommand=command??resolveCodex(environment,d.cwd);
  const code=await new Promise<number>((resolve,reject)=>{
   const child=spawn(selectedCommand.command,[...selectedCommand.args,...(selectedCommand.isolated===false?[]:['--no-daemon']),...args],{cwd:d.cwd,env:{...environment,CODEX_HOME:d.codexHome,MZ_CODEX_HUD_LAUNCH:d.file},stdio:'inherit',windowsHide:false,shell:false});
   child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?130:1)));
  });updateLaunch(d.file,v=>{v.state='exited';v.exitCode=code;v.heartbeat=Date.now();});return code;
 }catch(e){updateLaunch(d.file,v=>{v.state='exited';v.exitCode=1;});throw e;}
 finally{clearInterval(heartbeat);process.off('SIGINT',ignoreInterrupt);}
}
export interface DoctorReport {node:string;terminal:boolean;codex:boolean;hooks:string;plugin:HookSetup;configuration:{status:string;path:string};binding:{status:string;sessionId?:string};notes:string[]}
export function checkRuntime(options:{home?:string;configFile?:string;launchFile?:string}={}):DoctorReport{
 let terminal=false,codex=false;try{execFileSync('where.exe',['wt.exe'],{stdio:'ignore',windowsHide:true,timeout:1500});terminal=true;}catch{}
 try{resolveCodex();codex=true;}catch{}
 const file=options.configFile??configPath();let status=fs.existsSync(file)?'valid':'defaults';try{loadConfig(file);}catch{status='invalid';}
 let binding:DoctorReport['binding']={status:'not-selected'};if(options.launchFile){try{const launch=readLaunch(options.launchFile);binding={status:launch.state==='exited'?'exited':launch.sessionId?'bound':'pending',sessionId:launch.sessionId};if(launch.state==='running'&&launch.heartbeat&&Date.now()-launch.heartbeat>15000)binding.status='stale-runner';}catch{binding={status:'invalid-launch'};}}
 return {node:process.version,terminal,codex,hooks:'Review plugin hooks using /hooks in Codex; trust is never assumed',plugin:inspectHookSetup(options.home??codexHome()),configuration:{status,path:file},binding,notes:process.platform==='win32'?[]:['Automatic split launch requires native Windows Terminal']};
}
