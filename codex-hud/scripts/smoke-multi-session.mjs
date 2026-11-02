import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
import {autoStart} from '../dist/autostart.js';import {readLaunch,requestStop} from '../dist/runtime.js';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const event=(root,role)=>({hook_event_name:'SessionStart',source:role==='A'?'startup':'fork',session_id:'multi-'+role,transcript_path:path.join(root,role+'.jsonl')});
function environment(root){process.env.CODEX_HOME=path.join(root,'home');process.env.LOCALAPPDATA=path.join(root,'local');}
async function until(check,message){const end=Date.now()+12000;do{const value=check();if(value)return value;await delay(100);}while(Date.now()<end);throw Error(message);}
function displays(root){const dir=path.join(root,'local/mz-codex-hud/runtime');return fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>readLaunch(path.join(dir,n))):[];}
async function owner(root,role){
 environment(root);console.log('Independent HUD '+role+' preview - no Codex/model session was started.');
 try{
  const result=await autoStart(event(root,role),{configFile:path.join(root,role+'.json')});
  fs.writeFileSync(path.join(root,role+'.result.json'),JSON.stringify(result));
  const end=Date.now()+25000;while(!fs.existsSync(path.join(root,role+'.stop'))&&Date.now()<end)await delay(100);
 }catch(error){fs.writeFileSync(path.join(root,role+'.error.json'),JSON.stringify({error:error.message}));throw error;}
}
export async function main(args=process.argv.slice(2)){
 if(args[0]==='owner')return owner(args[1],args[2]);
 if(process.platform!=='win32')throw Error('Windows Terminal is required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-multi-'));environment(root);fs.mkdirSync(path.join(root,'home'));
 const windows={A:'hud-multi-A-'+randomUUID(),B:'hud-multi-B-'+randomUUID()};
 const boot="import(Buffer.from(process.argv[1],'base64').toString()).then(m=>m.main(process.argv.slice(2))).catch(e=>{console.error(e.message),process.exitCode=1})";
 try{
  for(const role of ['A','B']){
   const rows=[{type:'session_meta',payload:{id:'multi-'+role,cwd:root,source:'cli'}},{type:'event_msg',payload:{type:'token_count',info:{last_token_usage:{input_tokens:role==='A'?20000:70000,cached_input_tokens:0,output_tokens:0,total_tokens:role==='A'?20000:70000},model_context_window:100000}}}];
   fs.writeFileSync(path.join(root,role+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
   fs.writeFileSync(path.join(root,role+'.json'),JSON.stringify({startup:{window:windows[role]},terminal:{autoHeight:false,paneSize:0.25}}));
   execFileSync('wt.exe',['-w',windows[role],'--size','100,30','new-tab','--title','HUD conversation '+role+' preview','--suppressApplicationTitle',process.execPath,'-e',boot,Buffer.from(import.meta.url).toString('base64'),'owner',root,role],{windowsHide:false,stdio:'ignore',timeout:10000});
  }
  await until(()=>{
   for(const role of ['A','B'])if(fs.existsSync(path.join(root,role+'.error.json')))throw Error(read(path.join(root,role+'.error.json')).error);
   return ['A','B'].every(role=>fs.existsSync(path.join(root,role+'.result.json'))&&read(path.join(root,role+'.result.json')).status==='opened')&&displays(root).filter(d=>d.state==='running'&&d.viewport).length===2;
  },'Two independent conversations did not both open');
  const all=displays(root),a=all.find(d=>d.sessionId==='multi-A'),b=all.find(d=>d.sessionId==='multi-B');
  if(!a||!b||a.pid===b.pid||a.transcriptPath!==event(root,'A').transcript_path||b.transcriptPath!==event(root,'B').transcript_path)throw Error('Conversation binding is not independent');
  for(const role of ['A','B'])if((await autoStart(event(root,role),{configFile:path.join(root,role+'.json')})).status!=='already-open')throw Error('Same-conversation deduplication failed');
  if(displays(root).length!==2)throw Error('Duplicate HUD launch');
  requestStop(a.file);await until(()=>readLaunch(a.file).state==='exited','First HUD did not exit');
  const heartbeat=readLaunch(b.file).heartbeat;await until(()=>{const live=readLaunch(b.file);return live.state==='running'&&live.heartbeat>heartbeat;},'Closing the first HUD interrupted the second');
  console.log(JSON.stringify({status:'PASS',conversations:2,sameDirectory:true,sharedRuntime:true,independentBindings:true,sameConversationDeduplicated:true,closeIsolation:true}));
 }finally{
  for(const d of displays(root))if(d.state!=='exited'&&!d.hudStop)requestStop(d.file);
  for(const role of ['A','B'])fs.writeFileSync(path.join(root,role+'.stop'),'stop');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
