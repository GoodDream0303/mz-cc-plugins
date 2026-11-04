import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {configPath,defaultConfig,get,importClaude,loadConfig,saveConfig,set,type Config} from './config.js';
import {configure} from './config-menu.js';
import {SessionReader} from './reader.js';
import {codexHome,findSession,listSessions} from './sessions.js';
import {render} from './render.js';
import {readEnvironment} from './environment.js';
import {sanitize} from './terminal-text.js';
import {emptySnapshot,type HudSnapshot} from './types.js';
import {buildTerminalArgs,checkRuntime,createLaunch,readLaunch,requestStop,runtimeRoot,selectSessionId,updateLaunch,type LaunchDescriptor} from './runtime.js';
import {loadCurrentHost,ensureHostDisplay,bindHostSession,acknowledgeViewer,readHost} from './host-session.js';
import {readProcessFacts} from './psmux.js';
import {decodeInvocation,launchHostedCodex,runHostOwner,runHostFrontend} from './host-launch.js';
import {profileChange,applyProfileChange,stableEntryPlan,applyStableEntry} from './profile-setup.js';
import {fileURLToPath} from 'node:url';
import {assertActiveEntry} from './entry-install.js';
import {inspectSetup} from './setup-readiness.js';
import {sessionMetadata,isMainSession} from './autostart.js';
import {DynamicHeightController} from './dynamic-height.js';
import {AgentSessionTracker} from './agent-sessions.js';
import {HudSelection} from './selection.js';
import {copyHudText} from './clipboard.js';
import {HudInput} from './input.js';

function option(args:string[],key:string):string|undefined{const i=args.indexOf(key);return i>=0?args[i+1]:args.find(v=>v.startsWith(key+'='))?.slice(key.length+1);}
function launchFile(args:string[]):string|undefined{const encoded=option(args,'--launch64');return encoded?Buffer.from(encoded,'base64').toString('utf8'):option(args,'--launch');}
function configFile(args:string[]):string{return option(args,'--config')??configPath();}
function preview(config:Config):string[]{
 return render({...emptySnapshot('preview'),model:'Codex Demo',effort:'high',cwd:'C:/projects/firmware',context:{used:45000,window:200000},latest:{input:42000,cached:30000,output:3000,reasoning:1000,total:45000},totals:{input:120000,cached:90000,output:10000,reasoning:3000,total:130000},quotas:[{id:'demo:5h',minutes:300,usedPercent:25,resetsAt:Math.floor(Date.now()/1000)+3600},{id:'demo:7d',minutes:10080,usedPercent:35,resetsAt:Math.floor(Date.now()/1000)+86400}],agents:[{id:'demo',name:'reviewer',status:'running'}],todos:[{step:'Validate firmware',status:'in_progress'}],mcpUsed:['docs']},config,{width:process.stdout.columns??100,height:100,color:!!process.stdout.isTTY}).lines;
}
async function chooseSession(root:string):Promise<string>{
 const sessions=(await listSessions(root)).filter(s=>!s.parentId).slice(0,20);if(!sessions.length)throw new Error('No sessions found');
 if(!process.stdin.isTTY)throw new Error('Specify --session explicitly; the latest session is never selected automatically');
 sessions.forEach((s,i)=>console.log((i+1)+'. '+s.id+' '+sanitize(s.cwd)));
 const rl=createInterface({input:process.stdin,output:process.stdout});try{const i=Number(await rl.question('Select a session: '))-1;if(!sessions[i])throw new Error('No session selected');return sessions[i].id;}finally{rl.close();}
}
async function watch(args:string[],once=false):Promise<void>{
 const ownedFile=launchFile(args);let descriptor=ownedFile?readLaunch(ownedFile):undefined;
 const home=descriptor?.codexHome??codexHome();const root=option(args,'--sessions-root')??descriptor?.sessionsRoot??path.join(home,'sessions');
 let selected=descriptor?.host?descriptor.sessionId:descriptor?.sessionId??selectSessionId(option(args,'--session'));if(!selected&&!descriptor?.host)selected=await chooseSession(root);
 if(descriptor?.host&&!once){acknowledgeViewer(ownedFile!);descriptor=readLaunch(ownedFile!);}
 let cfgFile=descriptor?.configFile??configFile(args),config=loadConfig(cfgFile);let page=0,quit=false,reader:SessionReader|undefined,nextDiscover=0,nextOwnerCheck=0,knownPath='',statusMessage='';let lastSnapshot=emptySnapshot(selected??'pending');
 const selection=new HudSelection();let lastPaint='',clipboardError='';
 const paint=(lines:string[])=>{const text=lines.join('\r\n');if(text!==lastPaint){process.stdout.write('\x1b[H\x1b[2J'+text);lastPaint=text;}};
 const onMouse=(data:string)=>{if(selection.feed(data))paint(selection.paint());};
 const onKey=(_:unknown,key:{name?:string;ctrl?:boolean;sequence?:string})=>{
  if(key?.name==='q'){quit=true;return;}
  if(key?.name==='escape'){selection.clear();lastPaint='';return;}
  if(key?.name==='c'&&key.ctrl){const text=selection.text();if(text)try{copyHudText(text);clipboardError='';}catch{selection.clear();lastPaint='';clipboardError='Clipboard copy failed; select again and retry';}return;}
  if(selection.active)return;
  if(key?.name==='right'||key?.name==='n')page++;else if(key?.name==='left'||key?.name==='p')page=Math.max(0,page-1);
 };
 const input=new HudInput(onMouse,onKey),onData=(data:Buffer)=>input.feed(data);
 const interactive=!once&&!!process.stdin.isTTY;
 const dynamicHeight=new DynamicHeightController();
 const agentSessions=new AgentSessionTracker(root);
 if(interactive){process.stdin.setRawMode(true);process.stdin.on('data',onData);process.stdin.resume();}
 if(!once&&process.stdout.isTTY)process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[?1002h\x1b[?1006h');
 if(descriptor&&!descriptor.demo)updateLaunch(ownedFile!,d=>{d.state='running';d.pid=process.pid;d.heartbeat=Date.now();});
 try{
  do{
   if(descriptor){
    descriptor=readLaunch(ownedFile!);if(descriptor.hudStop||descriptor.state==='exited')break;
    if(selected!==descriptor.sessionId){reader=undefined;knownPath='';lastSnapshot=emptySnapshot(descriptor.sessionId??'pending');page=0;}
    selected=descriptor.sessionId;
    if(descriptor.host){
     if(readHost(descriptor.host.recordFile).state==='closed')break;
     if(Date.now()>=nextOwnerCheck){
      const expected=descriptor.host.proof.owner,actual=readProcessFacts([expected.pid]).find(p=>p.pid===expected.pid);nextOwnerCheck=Date.now()+5000;
      if(!actual||actual.startedAt!==expected.startedAt)break;
     }
    }
   }
   try{config=loadConfig(cfgFile);statusMessage='';}catch(e){statusMessage='Configuration reload failed: '+(e as Error).message;}
   let snapshot=emptySnapshot(selected??'pending');
   if(selected){
    if(descriptor?.transcriptPath){if(!reader||knownPath!==descriptor.transcriptPath){knownPath=descriptor.transcriptPath;reader=new SessionReader(knownPath,selected);}}
    else if(Date.now()>=nextDiscover||!reader){
     const session=await findSession(root,selected);nextDiscover=Date.now()+5000;
      if(session&&(!reader||session.path!==knownPath)){knownPath=session.path;reader=new SessionReader(session.path,session.id);selected=session.id;}
    }
     if(reader){try{snapshot=await reader.read();lastSnapshot=structuredClone(snapshot);}catch(e){snapshot=structuredClone(lastSnapshot);snapshot.errors.push('Session log unavailable; showing stale telemetry and retrying');}}
    else snapshot.errors.push('Waiting for the selected session log');
   }else snapshot.errors.push(descriptor?.host?'Waiting for this Codex conversation':'Select the existing Codex session to display');
   if(reader)await agentSessions.refresh(snapshot,reader);
   if(snapshot.cwd)snapshot.environment=readEnvironment(snapshot.cwd,home);
   if(statusMessage)snapshot.errors.push(statusMessage);
   if(clipboardError)snapshot.errors.push(clipboardError);
   const width=Number(option(args,'--width'))||process.stdout.columns||100,color=!args.includes('--no-color')&&!!process.stdout.isTTY;
   let rows=once?1000:process.stdout.rows||12,result=render(snapshot,config,{width,height:rows,page,color});
   selection.frame(result.lines,width,rows);
   if(!once&&process.stdout.isTTY&&descriptor?.host&&!selection.active){
    try{const fitted=dynamicHeight.fit(descriptor,config,result.totalLines);if(fitted!==undefined)rows=fitted;result=render(snapshot,config,{width,height:rows,page,color,showPager:!dynamicHeight.awaitingGrowth});}
    catch{snapshot.errors.push('Automatic height unavailable; keeping the current pane size');result=render(snapshot,config,{width,height:rows,page,color});}
   }
   if(descriptor&&!descriptor.demo)updateLaunch(ownedFile!,d=>{d.heartbeat=Date.now();d.viewport={columns:process.stdout.columns??100,rows,contentRows:result.totalLines,pages:result.pages,copying:selection.active};});
   if(args.includes('--json'))console.log(JSON.stringify(snapshot));else{
    if(!once&&process.stdout.isTTY){selection.frame(result.lines,width,rows);paint(selection.active?selection.paint():result.lines);}
    else console.log(result.lines.join('\n'));
   }
   if(once)break;
   if(!process.stdout.isTTY)break;
   await delay(get(config,'terminal.refreshMs'));
  }while(!quit);
 }finally{
  input.close();if(interactive){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();}
  if(!once&&process.stdout.isTTY)process.stdout.write('\x1b[?1002l\x1b[?1006l\x1b[0m\x1b[?25h\x1b[?1049l');
  if(descriptor&&!descriptor.demo)updateLaunch(ownedFile!,d=>{d.state='exited';d.exitCode=0;});
 }
}
async function demoRunner(d:LaunchDescriptor):Promise<void>{
 const id='demo-'+d.id;const root=path.join(path.dirname(d.file),'demo-sessions',d.id);fs.mkdirSync(root,{recursive:true});const file=path.join(root,id+'.jsonl');
 const row=(type:string,payload:unknown)=>JSON.stringify({timestamp:new Date().toISOString(),type,payload})+'\n';
 fs.writeFileSync(file,row('session_meta',{id,cwd:d.cwd,title:'List commonly used Codex plugins',timestamp:new Date().toISOString(),cli_version:'preview'})+row('turn_context',{model:'Codex HUD Demo',effort:'high',cwd:d.cwd})+row('event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:40000,cached_input_tokens:30000,output_tokens:5000,total_tokens:45000},total_token_usage:{input_tokens:120000,cached_input_tokens:90000,output_tokens:10000,total_tokens:130000},model_context_window:200000},rate_limits:{primary:{used_percent:25,window_minutes:300,resets_at:Math.floor(Date.now()/1000)+3600},secondary:{used_percent:10,window_minutes:10080,resets_at:Math.floor(Date.now()/1000)+86400}}}));
 fs.appendFileSync(file,row('response_item',{type:'function_call',call_id:'demo-plan',name:'update_plan',arguments:JSON.stringify({plan:[{step:'鍒楀嚭 Codex 甯哥敤鎻掍欢',status:'in_progress'},{step:'Verify configuration',status:'pending'}]})})+row('response_item',{type:'function_call_output',call_id:'demo-plan',output:'{}'}));
 // Demo is a user-facing layout preview, never a model invocation.
 updateLaunch(d.file,v=>{v.state='running';v.heartbeat=Date.now();});
 const newHome=readLaunch(d.file).codexHome;fs.mkdirSync(path.join(newHome,'sessions'),{recursive:true});fs.copyFileSync(file,path.join(newHome,'sessions',id+'.jsonl'));
 console.log('Codex HUD Preview - no model request; Codex was not started.\nThe HUD is below. Drag the divider to resize.');
 const timer=setInterval(()=>updateLaunch(d.file,v=>{v.heartbeat=Date.now();}),2000);
 try{await delay(d.demoDurationMs??120000);}finally{clearInterval(timer);updateLaunch(d.file,v=>{v.state='exited';v.exitCode=0;});}
}
async function start(args:string[],demo=false):Promise<void>{
 if(process.platform!=='win32')throw new Error('Automatic split launch requires native Windows; use watch manually elsewhere');
 if(!demo){
  if(option(args,'--window'))throw new Error('A Windows Terminal window cannot prove the source pane; use the verified psmux host');
  if(args.includes('--')||option(args,'--cwd'))throw new Error('HUD attaches the current Codex session; no launch arguments are accepted');
  const record=loadCurrentHost('hook'),current=selectSessionId(undefined),selected=selectSessionId(option(args,'--session'));
  if(!current||selected!==current)throw new Error('HUD must display the current Codex conversation in this exact host');
  const sessionsRoot=option(args,'--sessions-root')??path.join(codexHome(),'sessions'),session=await findSession(sessionsRoot,current);
  if(!session||session.id!==current)throw new Error('Current Codex transcript is not available yet');
  const meta=await sessionMetadata(session.path);if(session.parentId||!isMainSession(meta,current)||meta?.id!==current)throw new Error('HUD requires main CLI conversation provenance; subagent and non-CLI transcripts are excluded');
  if(args.includes('--dry-run')){await ensureHostDisplay(record,loadConfig(configFile(args)),{role:'hook',dryRun:true});console.log(JSON.stringify({mode:'attach',backend:'psmux',status:'validated',ownerPane:record.proof.origin.pane}));return;}
  const result=await bindHostSession(record,current,session.path,{role:'hook',config:loadConfig(configFile(args)),configFile:configFile(args)});console.log('HUD '+result.status+'.');return;
 }
 const report=checkRuntime();if(!report.terminal)throw new Error('Windows Terminal is missing; run doctor');
 if(args.includes('--')||option(args,'--cwd'))throw new Error('HUD attaches an existing session; no Codex launch arguments are accepted');
 const d=createLaunch(process.cwd(),loadConfig(configFile(args)),runtimeRoot(),configFile(args));
 updateLaunch(d.file,v=>{v.demo=true;v.demoDurationMs=Number(option(args,'--duration'))||120000;v.codexHome=path.join(path.dirname(v.file),'demo-home-'+v.id);v.sessionId='demo-'+v.id;});
 const descriptor=readLaunch(d.file),command=buildTerminalArgs(descriptor);
 if(args.includes('--dry-run')){updateLaunch(d.file,v=>{v.state='exited';v.exitCode=0;});console.log(JSON.stringify({mode:'demo',hooksRequired:false,window:'mz-codex-hud-'+d.id,paneSize:descriptor.paneSize,launch:d.file}));return;}
 try{execFileSync('wt.exe',command,{windowsHide:false,stdio:'ignore',timeout:10000});}catch(error){updateLaunch(d.file,v=>{v.state='exited';v.exitCode=1;});throw error;}console.log('HUD preview opened. Launch ID: '+d.id);
}

export async function main(args=process.argv.slice(2)):Promise<void>{
 const command=args[0]??'help',rest=args.slice(1);
 switch(command){
  case 'entry-check':if(!rest.includes('--runtime-only'))assertActiveEntry(fileURLToPath(new URL('../bin/hud.mjs',import.meta.url)));return;
  case 'codex-entry':process.exitCode=await launchHostedCodex(decodeInvocation(option(rest,'--invocation64')),{configFile:configFile(rest)});return;
  case 'host-owner':process.exitCode=await runHostOwner(decodeInvocation(option(rest,'--invocation64')),configFile(rest));return;
  case 'host-frontend':process.exitCode=await runHostFrontend(decodeInvocation(option(rest,'--invocation64')));return;
  case 'setup':{
   const profile=option(rest,'--profile');if(!profile)throw new Error('setup --profile ABSOLUTE_PATH [--psmux ABSOLUTE_PATH] [--enable] [--apply] [--remove]');
   const backend=option(rest,'--psmux'),enable=rest.includes('--enable'),remove=rest.includes('--remove'),initialize=rest.includes('--initialize')||backend!==undefined||enable;
   if(remove&&initialize)throw new Error('Use --remove separately from --psmux or --enable');
   const settingsFile=configFile(rest),settingsBefore=fs.existsSync(settingsFile)?fs.readFileSync(settingsFile):undefined;let original:Config,configValid=true;
   try{original=loadConfig(settingsFile);}catch(error){if(!remove)throw error;original=defaultConfig();configValid=false;}let proposed=original;
   const configChanges:Record<string,{before:unknown;after:unknown}>={};
   for(const [key,value]of [...(backend!==undefined?[['host.psmuxPath',backend] as const]:[]),...(enable?[['host.autoStart','enabled'] as const,['startup.enabled',false] as const]:[])]){
    if(get(proposed,key)!==value)configChanges[key]={before:get(proposed,key),after:value};proposed=set(proposed,key,value);
   }
   const readiness=inspectSetup(proposed,{configValid});
   const sourceLoader={entry:fileURLToPath(new URL('../bin/powershell-entry.ps1',import.meta.url)),cli:fileURLToPath(new URL('../bin/hud.mjs',import.meta.url)),node:process.execPath,configFile:path.resolve(settingsFile)};
   const runtime=remove?undefined:stableEntryPlan(sourceLoader),loader=runtime?.loader??sourceLoader;
   const change=profileChange(profile,loader,remove?'remove':'install'),apply=rest.includes('--apply'),blocked=apply&&initialize&&!readiness.ready;
   if(apply&&!blocked){
    if(initialize){const current=fs.existsSync(settingsFile)?fs.readFileSync(settingsFile):undefined;if(current===undefined?settingsBefore!==undefined:settingsBefore===undefined||!current.equals(settingsBefore))throw new Error('HUD configuration changed during setup review; rerun setup before applying');}
    if(runtime)applyStableEntry(runtime);
    applyProfileChange(change);
    if(initialize&&Object.keys(configChanges).length){
     try{saveConfig(settingsFile,proposed);}catch(error){
      // Roll back only the exact profile block just written, refusing concurrent edits.
      try{applyProfileChange({...change,before:change.after,after:change.before});}catch{throw new Error('Configuration save failed and the profile changed concurrently; inspect the profile before retrying setup');}
      throw error;
     }
    }
   }
   console.log(JSON.stringify({mode:initialize?'initialize':'profile-only',file:change.file,action:remove?'remove':'install',applied:apply&&!blocked,changed:change.before!==change.after||!!runtime?.files.some(f=>f.content!==f.before),loader,runtimeFiles:runtime?.files.map(f=>({file:f.file,changed:f.content!==f.before})),block:remove?change.removedBlock:change.block,removedBlock:change.removedBlock,configFile:settingsFile,configChanges,readiness},null,2));
   if(blocked)process.exitCode=1;return;
  }
  case 'start':return start(rest);
  case 'demo':return start(rest,true);
  case 'demo-runner':{
   const file=launchFile(rest);if(!file)throw new Error('Missing launch descriptor');const d=readLaunch(file);
   if(!d.demo)throw new Error('The demo runner cannot control a Codex session');return demoRunner(d);
  }
  case 'watch':return watch(rest);
  case 'once':return watch(rest,true);
  case 'list':{const sessions=await listSessions(option(rest,'--sessions-root')??path.join(codexHome(),'sessions'));for(const s of sessions)if(!s.parentId)console.log(s.id+'  '+sanitize(s.cwd));return;}
  case 'configure':await configure(configFile(rest),preview);return;
  case 'config':{
   const file=configFile(rest);if(rest[0]==='set'){if(!rest[1]||rest[2]===undefined)throw new Error('config set <key> <JSON value>');let value:unknown=rest[2];try{value=JSON.parse(rest[2]);}catch{}saveConfig(file,set(loadConfig(file),rest[1],value));console.log('Saved '+rest[1]);}
   else console.log(JSON.stringify(loadConfig(file),null,2));return;
  }
  case 'import-claude':{
   const file=configFile(rest);const source=option(rest,'--path')??path.join(os.homedir(),'.claude','plugins','claude-hud','config.json');
   const {config,report}=importClaude(JSON.parse(fs.readFileSync(source,'utf8').replace(/^\uFEFF/,'')));console.log(JSON.stringify(report,null,2));
   let yes=rest.includes('--yes');if(!yes&&process.stdin.isTTY){const rl=createInterface({input:process.stdin,output:process.stdout});try{yes=(await rl.question('Save imported configuration? [y/N] ')).toLowerCase()==='y';}finally{rl.close();}}
   if(yes){saveConfig(file,config);console.log('Imported '+file);}else console.log('Preview only; use --yes to save the import');return;
  }
  case 'doctor':{
   const id=option(rest,'--launch');if(id&&!/^[a-f0-9-]{36}$/i.test(id))throw new Error('doctor --launch <launch ID>');
   console.log(JSON.stringify(checkRuntime({configFile:configFile(rest),launchFile:id?path.join(runtimeRoot(),id+'.json'):undefined}),null,2));return;
  }
  case 'stop':{const id=option(rest,'--launch');if(!id||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('stop --launch <launch ID>');requestStop(path.join(runtimeRoot(),id+'.json'));console.log('HUD stop requested; Codex keeps running');return;}
  case 'help':case '--help':case '-h':
   console.log('mz-codex-hud\n  start [--session CURRENT_ID]\n  watch|once [--session ID] [--json] [--width N]\n  list\n  setup --profile ABSOLUTE_PATH [--initialize] [--psmux ABSOLUTE_PATH] [--enable] [--apply] [--remove]\n  configure\n  config show | config set KEY VALUE\n  import-claude [--path CONFIG] [--yes]\n  doctor\n  demo [--duration MILLISECONDS]\n  stop --launch ID\nAutomatic opening requires the configured PowerShell host entry. SessionStart binds current telemetry.\nNative statusline is unchanged. All commands accept --config FILE.');return;
  default:throw new Error('Unknown command: '+command);
 }
}
