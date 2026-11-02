import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
import {main as hudMain} from '../dist/cli.js';
import {readLaunch,requestStop} from '../dist/runtime.js';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function viewport(){
 // Windows may not refresh cached .rows while an idle owner never reads stdin.
 // This test-only native query checks the actual console after the split.
 const cells=[];if(process.stdout._handle?.getWindowSize&&!process.stdout._handle.getWindowSize(cells))return {columns:cells[0],rows:cells[1]};
 return {columns:process.stdout.columns,rows:process.stdout.rows};
}
async function waitFor(check,message,ms=12000){const until=Date.now()+ms;do{const value=check();if(value)return value;await delay(100);}while(Date.now()<until);throw Error(message);}
async function owner(root){
 const id='height-'+path.basename(root),sessions=path.join(root,'sessions'),local=path.join(root,'local'),home=path.join(root,'home'),config=path.join(root,'config.json');
 fs.mkdirSync(sessions,{recursive:true});fs.mkdirSync(home,{recursive:true});
 process.env.CODEX_HOME=home;process.env.LOCALAPPDATA=local;
 const row=(type,payload)=>JSON.stringify({type,payload})+'\n';
 fs.writeFileSync(path.join(sessions,'session.jsonl'),row('session_meta',{id,cwd:root,source:'cli'})+row('event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:40000,cached_input_tokens:30000,output_tokens:5000,total_tokens:45000},total_token_usage:{input_tokens:120000,cached_input_tokens:90000,output_tokens:10000,total_tokens:130000},model_context_window:200000},rate_limits:{primary:{used_percent:25,window_minutes:300,resets_at:Math.floor(Date.now()/1000)+3600}}}));
 fs.writeFileSync(config,JSON.stringify({terminal:{paneSize:0.6,autoHeight:true},display:{showSessionTokens:true}}));
 const before=viewport();
 console.log('HUD initial height preview - no model request; Codex was not started.');
 try{
  let output='';const originalWrite=process.stdout.write;
  try{process.stdout.write=function(chunk,...rest){output+=String(chunk);const done=rest.find(value=>typeof value==='function');done?.();return true;};await hudMain(['start','--session',id,'--sessions-root',sessions,'--config',config,'--dry-run']);}
  finally{process.stdout.write=originalWrite;}
  const dryRun=JSON.parse(output);if(dryRun.paneSize!==readLaunch(dryRun.launch).paneSize)throw Error('Dry-run fraction does not match launch metadata');
  await hudMain(['start','--session',id,'--sessions-root',sessions,'--config',config]);
  const runtime=path.join(local,'mz-codex-hud/runtime'),launch=fs.readdirSync(runtime).find(name=>/^[a-f0-9-]{36}\.json$/.test(name)&&readLaunch(path.join(runtime,name)).state!=='exited');
  if(!launch)throw Error('No owned launch metadata');
  const file=path.join(runtime,launch);
  const until=Date.now()+20000;while(!fs.existsSync(path.join(root,'stop'))&&Date.now()<until){
   fs.writeFileSync(path.join(root,'owner.tmp'),JSON.stringify({before,after:viewport(),file}));fs.renameSync(path.join(root,'owner.tmp'),path.join(root,'owner.json'));await delay(100);
  }
  const d=readLaunch(file);if(d.state!=='exited'&&!d.hudStop)requestStop(file);
 }catch(error){fs.writeFileSync(path.join(root,'error.json'),JSON.stringify({error:error.message}));throw error;}
}
export async function main(args=process.argv.slice(2)){
 if(args[0]==='owner')return owner(args[1]);
 if(process.platform!=='win32')throw Error('This smoke test needs Windows Terminal');
 const columns=Number(args[0]??120),rows=Number(args[1]??40),root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-fit-'));
 const boot="import(Buffer.from(process.argv[1],'base64').toString()).then(m=>m.main(process.argv.slice(2))).catch(e=>{console.error(e.message),process.exitCode=1})";
 const entry=Buffer.from(import.meta.url).toString('base64');let launch;
 try{
  execFileSync('wt.exe',['-w','hud-fit-'+randomUUID(),'--size',columns+','+rows,'new-tab','--title','HUD initial height preview','--suppressApplicationTitle',process.execPath,'-e',boot,entry,'owner',root],{windowsHide:false,stdio:'ignore',timeout:10000});
  let report=await waitFor(()=>{
   if(fs.existsSync(path.join(root,'error.json')))throw Error(read(path.join(root,'error.json')).error);
   return fs.existsSync(path.join(root,'owner.json'))?read(path.join(root,'owner.json')):undefined;
  },'Preview owner did not report its geometry');
  launch=report.file;
  const d=await waitFor(()=>{const d=readLaunch(launch),v=d.viewport;return d.state==='running'&&v&&v.pages===1&&v.rows>=v.contentRows&&v.rows<=v.contentRows+2?d:undefined;},'HUD did not reach its content-sized viewport');
  if(d.initialSizing?.mode!=='content'||d.initialSizing.parentRows!==report.before.rows)throw Error('Initial sizing did not use the exact parent viewport');
  if(d.viewport.pages!==1||d.viewport.rows<d.viewport.contentRows||d.viewport.rows>d.viewport.contentRows+2)throw Error('Unexpected HUD height '+JSON.stringify(d.viewport));
  report=await waitFor(()=>{const r=read(path.join(root,'owner.json'));return r.after.rows>=10&&r.after.rows<r.before.rows?r:undefined;},'Unexpected owner row allocation');
  requestStop(launch);await waitFor(()=>readLaunch(launch).state==='exited','HUD did not close independently');
  console.log(JSON.stringify({status:'PASS',requested:{columns,rows},owner:report,initial:d.initialSizing,hud:d.viewport}));
 }finally{
  if(launch){try{const d=readLaunch(launch);if(d.state!=='exited'&&!d.hudStop)requestStop(launch);}catch{}}
  fs.writeFileSync(path.join(root,'stop'),'stop');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
