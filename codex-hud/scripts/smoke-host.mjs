// Production backend smoke with real OS processes and explicitly synthetic CLI/data.
// A copied Node executable named codex.exe is a fixture, NOT official Codex.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
import {defaultConfig,set,saveConfig} from '../dist/config.js';import {readHost} from '../dist/host-session.js';import {readLaunch,requestStop} from '../dist/runtime.js';
const self=fileURLToPath(import.meta.url),product=path.resolve(path.dirname(self),'..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function wait(check,message,ms=25000){const until=Date.now()+ms;do{const value=await check();if(value)return value;await delay(100);}while(Date.now()<until);throw Error(message);}
if(process.argv[2]==='--fixture'){
 const [role,root,node]=process.argv.slice(3),host=path.join(process.env.MZ_HUD_HOST_DIR,process.env.MZ_HUD_ORIGIN+'.json');
 console.log('SYNTHETIC CODEX '+role+' - no official CLI or model request');
 fs.writeFileSync(path.join(root,'ready-'+role+'.json'),JSON.stringify({pid:process.pid,host}));
 while(!fs.existsSync(path.join(root,'stop-'+role))){
  const request=path.join(root,'request-'+role+'.json'),result=path.join(root,'result-'+role+'.json');
  if(fs.existsSync(request)&&!fs.existsSync(result)){
   const event=read(request),child=spawnSync(node,[path.join(product,'hooks/session-start.mjs')],{input:JSON.stringify(event),env:{...process.env,CODEX_THREAD_ID:event.session_id},encoding:'utf8',windowsHide:true,timeout:20000});
   fs.writeFileSync(result,JSON.stringify({code:child.status,stdout:child.stdout,stderr:child.stderr}));
  }
  await delay(50);
 }
 process.exitCode=0;
}else{
 const index=process.argv.indexOf('--psmux'),binary=index<0?undefined:process.argv[index+1];if(!binary||!path.isAbsolute(binary))throw Error('smoke-host.mjs --psmux ABSOLUTE_PINNED_EXE [--zip VERIFIED_ZIP]');
 const zipIndex=process.argv.indexOf('--zip');if(zipIndex>=0){const digest=createHash('sha256').update(fs.readFileSync(process.argv[zipIndex+1])).digest('hex');assert.equal(digest,'a66b6be7c13c6fa0dc3660a267b9e34eaa91a4eb7f07fbd55a0468018bd0f721');}
 assert.match(spawnSync(binary,['-V'],{encoding:'utf8',windowsHide:true}).stdout,/psmux 3\.4\.0 \(20aa1d7/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-production-host-')),runtime=path.join(root,'runtime'),hostDir=path.join(runtime,'hosts'),fake=path.join(root,'codex.exe'),configFile=path.join(root,'local/mz-codex-hud/config.json'),codexHome=path.join(root,'codex-home'),cwd=path.join(root,'samecwd');
 fs.mkdirSync(cwd,{recursive:true});fs.mkdirSync(codexHome);fs.cpSync(process.execPath,fake);saveConfig(configFile,set(set(set(defaultConfig(),'host.psmuxPath',binary),'startup.enabled',false),'host.autoStart','enabled'));
 const parked=path.join(root,'first-viewer-parked'),preload=path.join(root,'park-first-viewer.mjs');
 if(process.argv.includes('--kill-first-viewer'))fs.writeFileSync(preload,`import fs from 'node:fs';if(process.argv[2]==='watch'){let first=false;try{fs.writeFileSync(${JSON.stringify(parked)},String(process.pid),{flag:'wx'});first=true;}catch{}if(first)await new Promise(resolve=>setTimeout(resolve,30000));}`);
 const config=path.join(root,'psmux.conf');fs.writeFileSync(config,'set -g warm off\nset -g status off\nset -g exit-empty on\n');
 const roles=new Map(),checks=[];
 function command(role,args,allowFailure=false){
  const item=roles.get(role),result=spawnSync(binary,['-L',item.namespace,'-f',config,...args],{env:item.env,cwd,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
  if(!allowFailure&&(result.status!==0||result.error))throw Error('psmux '+args[0]+' failed: '+(result.error?.message??result.stderr));return result;
 }
 function descriptor(role){const item=roles.get(role),record=readHost(path.join(hostDir,item.id+'.json'));return record.launchFile?readLaunch(record.launchFile):undefined;}
 async function ready(role){return wait(()=>{try{const d=descriptor(role);return d?.state==='running'&&fs.existsSync(path.join(root,'ready-'+role+'.json'))?d:undefined;}catch{return;}},role+' did not create a waiting HUD');}
 async function bind(role,id,percent){
  const request=path.join(root,'request-'+role+'.json'),result=path.join(root,'result-'+role+'.json'),transcript=path.join(root,role+'-'+id+'.jsonl');
  const row=(type,payload)=>JSON.stringify({type,payload})+'\n';fs.writeFileSync(transcript,row('session_meta',{id,cwd,source:'cli'})+row('event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:percent*1000,cached_input_tokens:0,output_tokens:0,total_tokens:percent*1000},model_context_window:100000}}));
  if(fs.existsSync(result))fs.unlinkSync(result);fs.writeFileSync(request,JSON.stringify({hook_event_name:'SessionStart',source:'resume',session_id:id,transcript_path:transcript,cwd}));
  const response=await wait(()=>fs.existsSync(result)?read(result):undefined,'Synthetic hook did not return');assert.equal(response.code,0);assert.equal(response.stdout,'');assert.equal(response.stderr,'');
  await wait(()=>descriptor(role)?.sessionId===id,'Hook did not bind the synthetic thread to '+role);fs.unlinkSync(request);
  await wait(()=>command(role,['capture-pane','-p','-t',descriptor(role).host.hudPane]).stdout.includes(percent+'%'),'HUD did not render '+role+' synthetic telemetry');
 }
 try{
  for(const role of ['A','B']){
   const id=randomUUID(),namespace='mzhudsmoke'+role+id.replaceAll('-','').slice(0,16),dataDir=path.join(root,'state',role),env={...process.env};for(const key of Object.keys(env))if(/^TMUX|^PSMUX_/i.test(key))delete env[key];
   Object.assign(env,{MZ_HUD_ORIGIN:id,MZ_HUD_NAMESPACE:namespace,MZ_HUD_HOST_DIR:hostDir,MZ_HUD_PSMUX:binary,PSMUX_DATA_DIR:dataDir,PSMUX_CONFIG_FILE:config,PSMUX_NO_WARM:'1',LOCALAPPDATA:path.join(root,'local'),CODEX_HOME:codexHome});
   if(role==='A'&&process.argv.includes('--kill-first-viewer'))env.NODE_OPTIONS='--import='+new URL('file:///'+preload.replaceAll('\\','/')).href;
   roles.set(role,{id,namespace,env});const encoded=Buffer.from(JSON.stringify({command:fake,args:[self,'--fixture',role,root,process.execPath]})).toString('base64');
   command(role,['new-session','-d','-s','codex','-x','120','-y','40','-c',cwd,'--',process.execPath,path.join(product,'bin/hud.mjs'),'host-owner','--invocation64',encoded,'--config',configFile]);
   if(role==='A'&&process.argv.includes('--kill-first-viewer')){
    const pending=await wait(()=>{try{const d=descriptor(role);return d?.state==='created'&&d.host?.reportedPane&&fs.existsSync(parked)?d:undefined;}catch{return;}},'A did not publish its exact parked pending pane');
    command(role,['kill-pane','-t',pending.host.reportedPane]);await ready(role);assert.notEqual(descriptor(role).file,pending.file);assert.equal(readLaunch(pending.file).host.phase,'closed');checks.push('killed a reported viewer before acknowledgement; source recovered only after exact absence proof');
   }else await ready(role);
  }
  const a=descriptor('A'),b=descriptor('B');assert.equal(a.sessionId,undefined);assert.equal(b.sessionId,undefined);assert.notEqual(a.id,b.id);assert.notEqual(a.host.proof.server.pid,b.host.proof.server.pid);checks.push('two real source owners each open an independent waiting HUD before a hook');
  await bind('A','synthetic-thread-a',20);await bind('B','synthetic-thread-b',70);assert.equal(descriptor('A').sessionId,'synthetic-thread-a');checks.push('native hook process ancestry binds A20% and B70% independently (synthetic CLI)');
  const launchA=descriptor('A').file;await bind('A','synthetic-shared-thread',30);await bind('B','synthetic-shared-thread',30);assert.equal(descriptor('A').file,launchA);assert.notEqual(descriptor('A').file,descriptor('B').file);checks.push('same thread in two source owners retains two displays; rebind does not duplicate');
  requestStop(descriptor('A').file);await wait(()=>descriptor('A').state==='exited','A HUD did not close');assert.equal(descriptor('B').state,'running');
  await delay(500);await bind('A','synthetic-reopened',45);assert.notEqual(descriptor('A').file,launchA);checks.push('closing/reopening one HUD keeps the other source and display alive');
  for(const role of ['A','B'])fs.writeFileSync(path.join(root,'stop-'+role),'stop');
  await wait(()=>['A','B'].every(role=>readHost(path.join(hostDir,roles.get(role).id+'.json')).state==='closed'),'Source wrappers did not close');
  await wait(()=>['A','B'].every(role=>descriptor(role).state==='exited'),'Owned HUDs did not stop after their source exit');checks.push('source exit closes only its owned display');
  const summary={verdict:'PASS_SYNTHETIC_PRODUCTION_BACKEND',root,checks,limitations:['Renamed Node fixture, not official Codex; real hook trust/default shared-daemon behavior and actual interactive desktop use remain unverified.']};fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
 }catch(error){console.error(JSON.stringify({root,error:error.message}));process.exitCode=1;}
 finally{
  for(const role of roles.keys())fs.writeFileSync(path.join(root,'stop-'+role),'stop');
  await delay(1000);
  for(const role of roles.keys()){
   const item=roles.get(role),file=path.join(hostDir,item.id+'.json');
   if(fs.existsSync(file)){const record=readHost(file);if(record.state==='running')command(role,['kill-session','-t','codex'],true);}
  }
 }
}
