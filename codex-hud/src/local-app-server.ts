import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveOfficial} from './entry-resolver.js';
import {readProcessIdentities,type LocalAppServerProof} from './psmux.js';
import {localAppServerEndpoint} from './mcp-runtime.js';
import type {CodexInvocation} from './host-launch.js';

export const appServerTokenEnvironment='MZ_HUD_APP_SERVER_TOKEN';
export function resolveOfficialExecutable(command:string):string {
 const resolved=resolveOfficial(command);
 if(!resolved.prefix.length){if(path.basename(resolved.file).toLowerCase()!=='codex.exe')throw new Error('The managed service requires the official native Codex executable');return resolved.file;}
 const script=resolved.prefix[0],require=createRequire(script),architecture=process.arch==='arm64'?'arm64':'x64',triple=architecture==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
 let vendor:string;
 try{vendor=path.join(path.dirname(require.resolve('@openai/codex-win32-'+architecture+'/package.json')),'vendor');}
 catch{vendor=path.resolve(path.dirname(script),'../vendor');}
 try{const file=fs.realpathSync(path.join(vendor,triple,'bin/codex.exe'));if(!fs.statSync(file).isFile())throw new Error();return file;}
 catch{throw new Error('The official npm native executable is unavailable');}
}
export function localAppServerStartup(args:string[]):{args:string[];cwd:string} {
 const forwarded:string[]=[],values=new Set(['-m','--model','-s','--sandbox','-a','--ask-for-approval','--add-dir','--remote-auth-token-env']);let cwd=process.cwd();
 for(let i=0;i<args.length;i++){
  const item=args[i],key=item.split('=',1)[0];if(item==='--')break;
  if(key==='--profile'||item==='-p'||/^\-p.+/.test(item))throw new Error('A named profile requires ordinary CLI startup');
  if(['--no-daemon','--oss','--local-provider','--remote'].includes(key))throw new Error(key+' requires ordinary CLI startup');
  if(['-c','--config','--enable','--disable'].includes(key)){
   forwarded.push(item);if(!item.includes('=')){if(i+1>=args.length)throw new Error('Missing startup option value');forwarded.push(args[++i]);}continue;
  }
  if(item.startsWith('-c')&&item.length>2){forwarded.push('-c',item.slice(2));continue;}
  if(key==='--strict-config'){forwarded.push(item);continue;}
  if(key==='-C'||key==='--cd'){const directory=item.includes('=')?item.slice(item.indexOf('=')+1):args[++i];if(!directory)throw new Error('Missing working directory');cwd=path.resolve(directory);continue;}
  if(item.startsWith('-C')&&item.length>2){cwd=path.resolve(item.slice(2));continue;}
  if(values.has(key)&&!item.includes('=')){i++;continue;}
  if(key==='--image'||key==='-i')while(i+1<args.length&&!args[i+1].startsWith('-'))i++;
 }
 return {args:forwarded,cwd};
}
export function remoteInvocation(invocation:CodexInvocation,endpoint:string):CodexInvocation {
 return {command:invocation.command,args:['--remote',localAppServerEndpoint(endpoint).replace(/\/$/,''),'--remote-auth-token-env',appServerTokenEnvironment,...invocation.args]};
}
export function readLoopbackListener(port:number):number {
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid loopback port');
 const helper=fileURLToPath(new URL('../bin/listener-facts.ps1',import.meta.url));
 const raw=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',helper,'-ListenPort',String(port)],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:4096,stdio:['ignore','pipe','pipe']}).trim();
 if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error('Invalid loopback listener identity');
 return Number(raw);
}
export async function startLocalAppServer(invocation:CodexInvocation,token:string):Promise<{proof:LocalAppServerProof;stop():Promise<void>}> {
 if(process.platform!=='win32')throw new Error('Local App Server mode requires native Windows');
 if(!/^[a-zA-Z0-9_-]{43,128}$/.test(token))throw new Error('Local App Server credential is unavailable');
 const startup=localAppServerStartup(invocation.args),binary=resolveOfficialExecutable(invocation.command),reservation=net.createServer();
 await new Promise<void>((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
 const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
 const endpoint='ws://127.0.0.1:'+port,env={...process.env};delete env[appServerTokenEnvironment];
 const child=spawn(binary,[...startup.args,'app-server','--listen',endpoint,'--ws-auth','capability-token','--ws-token-sha256',createHash('sha256').update(token).digest('hex')],{cwd:startup.cwd,env,stdio:'ignore',windowsHide:true});
 let failed=false,exited=false;child.once('error',()=>{failed=true;});const closed=new Promise<void>(resolve=>child.once('close',()=>{exited=true;resolve();}));
 const stop=async()=>{
  if(!exited){child.kill();let timer:NodeJS.Timeout|undefined;try{await Promise.race([closed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Local App Server did not exit')),3000);})]);}finally{clearTimeout(timer);}}
 };
 try{
  const deadline=Date.now()+8000;let ready=false;
  while(!failed&&!exited&&Date.now()<deadline){
   try{ready=(await fetch('http://127.0.0.1:'+port+'/readyz',{signal:AbortSignal.timeout(500),redirect:'error'})).ok;}catch{/* Listener startup is still pending. */}
   if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready||failed||exited||!child.pid)throw new Error('Local App Server listener startup failed');
  if(readLoopbackListener(port)!==child.pid)throw new Error('Local App Server does not own its listener');
  const actual=readProcessIdentities([child.pid]).find(p=>p.pid===child.pid);
  if(!actual||actual.parentPid!==process.pid||actual.name.toLowerCase()!=='codex.exe'||exited)throw new Error('Local App Server process identity is unavailable');
  return {proof:{endpoint,process:actual},stop};
 }catch(error){await stop();throw error;}
}
