import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {emitKeypressEvents} from 'node:readline';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {configPath,defaultConfig,get,importClaude,loadConfig,saveConfig,set,type Config} from './config.js';
import {configure} from './config-menu.js';
import {SessionReader} from './reader.js';
import {codexHome,findSession,listSessions} from './sessions.js';
import {render} from './render.js';
import {readEnvironmentAsync} from './environment.js';
import {frameUpdate,sanitize} from './terminal-text.js';
import {emptySnapshot,type HudSnapshot} from './types.js';
import {buildTerminalArgs,checkRuntime,createLaunch,readLaunch,requestStop,runtimeRoot,selectSessionId,updateLaunch,type LaunchDescriptor} from './runtime.js';
import {loadCurrentHost,ensureHostDisplay,bindHostSession,acknowledgeViewer,readHost} from './host-session.js';
import {readProcessIdentitiesAsync} from './psmux.js';
import {RefreshEvents} from './refresh-events.js';
import {nextDisplayAt} from './display-deadline.js';
import {decodeInvocation,launchHostedCodex,runHostOwner,runHostFrontend} from './host-launch.js';
import {profileChange,applyProfileChange,stableEntryPlan,applyStableEntry} from './profile-setup.js';
import {fileURLToPath} from 'node:url';
import {assertActiveEntry} from './entry-install.js';
import {inspectSetup} from './setup-readiness.js';
import {sessionMetadata,isMainSession} from './autostart.js';
import {DynamicHeightController} from './dynamic-height.js';
import {AgentSessionTracker} from './agent-sessions.js';

function option(args:string[],key:string):string|undefined{const i=args.indexOf(key);return i>=0?args[i+1]:args.find(v=>v.startsWith(key+'='))?.slice(key.length+1);}
function launchFile(args:string[]):string|undefined{const encoded=option(args,'--launch64');return encoded?Buffer.from(encoded,'base64').toString('utf8'):option(args,'--launch');}
function configFile(args:string[]):string{return option(args,'--config')??configPath();}
function preview(config:Config):string[]{
 return render({...emptySnapshot('preview'),model:'Codex Demo',effort:'high',cwd:'C:/projects/firmware',context:{used:45000,window:200000},latest:{input:42000,cached:30000,output:3000,reasoning:1000,total:45000},totals:{input:120000,cached:90000,output:10000,reasoning:3000,total:130000},quotas:[{id:'demo:5h',minutes:300,usedPercent:25,resetsAt:Math.floor(Date.now()/1000)+3600},{id:'demo:7d',minutes:10080,usedPercent:35,resetsAt:Math.floor(Date.now()/1000)+86400}],agents:[{id:'demo',name:'reviewer',status:'running'}],todos:[{step:'Validate firmware',status:'in_progress'}]},config,{width:process.stdout.columns??100,height:100,color:!!process.stdout.isTTY}).lines;
}
async function chooseSession(root:string):Promise<string>{
 const sessions=(await listSessions(root)).filter(s=>!s.parentId).slice(0,20);if(!sessions.length)throw new Error('No sessions found');
 if(!process.stdin.isTTY)throw new Error('Specify --session explicitly; the latest session is never selected automatically');
 sessions.forEach((s,i)=>console.log((i+1)+'. '+s.id+' '+sanitize(s.cwd)));
 const rl=createInterface({input:process.stdin,output:process.stdout});try{const i=Number(await rl.question('Select a session: '))-1;if(!sessions[i])throw new Error('No session selected');return sessions[i].id;}finally{rl.close();}
}
function inputStamp(file:string):string {
 try{const stat=fs.statSync(file,{bigint:true});return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.birthtimeNs].join(':');}catch{return 'missing';}
}
function controlState(d:LaunchDescriptor):string{return JSON.stringify([d.sessionId,d.transcriptPath,d.state,d.hudStop,d.host]);}
async function watch(args:string[],once=false):Promise<void>{
 const ownedFile=launchFile(args);let descriptor=ownedFile?readLaunch(ownedFile):undefined;
 const home=descriptor?.codexHome??codexHome(),root=option(args,'--sessions-root')??descriptor?.sessionsRoot??path.join(home,'sessions');
 let selected=descriptor?.host?descriptor.sessionId:descriptor?.sessionId??selectSessionId(option(args,'--session'));if(!selected&&!descriptor?.host)selected=await chooseSession(root);
 if(descriptor?.host&&!once){acknowledgeViewer(ownedFile!);descriptor=readLaunch(ownedFile!);}
 const cfgFile=descriptor?.configFile??configFile(args);let quit=false,activeQuery:AbortController|undefined;
 let exitReason:NonNullable<LaunchDescriptor['exitReason']>='normal',exitErrorCode:string|undefined,bodyFailed=false;
 let projection=descriptor?controlState(descriptor):'',sourceMessage='',sourceVerified=true,registrationUnavailable=false;
 const events=new RefreshEvents(undefined,reason=>{
  if(reason==='config'||reason==='geometry')activeQuery?.abort();
  if(reason==='control'&&ownedFile)try{
   const next=readLaunch(ownedFile);if(next.hudStop||next.state==='exited'){quit=true;exitReason='stop-requested';activeQuery?.abort();events.request('quit');return false;}
   if(controlState(next)===projection)return false;activeQuery?.abort();
  }catch{/* The worker reports or reconciles invalid control state. */}
  if(reason==='host'&&descriptor?.host)try{if(readHost(descriptor.host.recordFile).state==='closed'){quit=true;exitReason='source-closed';activeQuery?.abort();events.request('quit');}}catch{}
 });
 const releases=new Map<string,()=>void>();
 const subscribe=(file:string,reason:string,recursive=false)=>{const key=reason+'\0'+file;if(!releases.has(key))releases.set(key,events.watch(file,reason,recursive));};
 const remove=(reason:string,keep:Set<string>)=>{for(const [key,release]of releases)if(key.startsWith(reason+'\0')&&!keep.has(key.slice(reason.length+1))){release();releases.delete(key);}};
 subscribe(cfgFile,'config');if(ownedFile)subscribe(ownedFile,'control');if(descriptor?.host)subscribe(descriptor.host.recordFile,'host');
 let config:Config;let cfgStamp=inputStamp(cfgFile);
 try{config=loadConfig(cfgFile);}catch(error){events.close();throw error;}
 let page=0,reader:SessionReader|undefined,knownPath='',statusMessage='',nextDiscover=0,nextOwnerCheck=0,nextGit=0,nextHeartbeat=0,nextReconcile=0,nextClock=Infinity;
 let parentSnapshot=emptySnapshot(selected??'pending'),baseSnapshot=parentSnapshot,telemetry='',lastViewport='',lastGeometry='';
 let paintedLines:string[]=[],paintedGeometry='',paintInvalidated=true;
 let environment:HudSnapshot['environment'],environmentCwd='';
 const dynamicHeight=new DynamicHeightController();let agentSessions=new AgentSessionTracker(root);
 const recordFailure=(error:unknown)=>{exitReason='error';const code=(error as NodeJS.ErrnoException)?.code;exitErrorCode=typeof code==='string'&&/^[A-Z0-9_]{1,64}$/.test(code)?code:undefined;};
 const onKey=(_:unknown,key:{name?:string;ctrl?:boolean})=>{if(key?.name==='q'){quit=true;exitReason='user-quit';activeQuery?.abort();events.request('quit');}else if(['right','n','left','p'].includes(key?.name??'')){page=key.name==='right'||key.name==='n'?page+1:Math.max(0,page-1);events.request('page');}};
 const onResize=()=>{paintInvalidated=true;events.request('geometry');};const interactive=!once&&!!process.stdin.isTTY;
 if(interactive){emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.on('keypress',onKey);process.stdin.resume();}
 if(!once&&process.stdout.isTTY){process.stdout.on('resize',onResize);process.stdout.write('\x1b[?1049h\x1b[?25l');}
 let reasons=new Set(['initial']);
 try{
  if(descriptor&&!descriptor.demo){descriptor=updateLaunch(ownedFile!,d=>{d.state='running';d.pid=process.pid;d.heartbeat=Date.now();});projection=controlState(descriptor);nextHeartbeat=Date.now()+get(config,'terminal.refreshMs');}
  while(!quit){
   const initial=reasons.has('initial'),now=Date.now(),reconcile=now>=nextReconcile;let dirty=initial||reasons.has('page')||reasons.has('geometry');
   if(reconcile){nextReconcile=now+get(config,'terminal.refreshMs');events.reconcile();}
   activeQuery=new AbortController();const signal=activeQuery.signal;
   const current=()=>{
    if(quit||signal.aborted)return false;
    if(ownedFile){const d=readLaunch(ownedFile);if(d.hudStop||d.state==='exited'||controlState(d)!==projection)return false;}
    return true;
   };
   try{
    let bindingChanged=false;
    if(descriptor&&(initial||reconcile||reasons.has('control'))){
     const next=readLaunch(ownedFile!);if(next.hudStop||next.state==='exited'){exitReason='stop-requested';break;}
     const changed=controlState(next)!==projection;projection=controlState(next);
     bindingChanged=selected!==next.sessionId||descriptor.transcriptPath!==next.transcriptPath;
     descriptor=next;selected=next.sessionId;dirty||=changed;
     if(bindingChanged){reader=undefined;knownPath='';parentSnapshot=emptySnapshot(selected??'pending');baseSnapshot=parentSnapshot;agentSessions=new AgentSessionTracker(root);remove('log',new Set());remove('child',new Set());page=0;nextDiscover=0;}
    }
    if(descriptor?.host)try{
     if(initial||reconcile||reasons.has('host')){const registered=readHost(descriptor.host.recordFile);if(registered.state==='closed'){exitReason='source-closed';break;}if(registrationUnavailable){registrationUnavailable=false;nextOwnerCheck=0;}}
     if(Date.now()>=nextOwnerCheck){
      try{const expected=descriptor.host.proof.owner,values=await readProcessIdentitiesAsync([expected.pid],signal),actual=values.find(p=>p.pid===expected.pid);
       if(!current()){reasons=new Set(['control']);continue;}
       if(!actual||actual.startedAt!==expected.startedAt){exitReason='owner-exited';break;}sourceVerified=true;sourceMessage='';
      }catch(error){if(signal.aborted)throw error;sourceVerified=false;sourceMessage='Source identity unavailable; keeping HUD open and retrying';}
      nextOwnerCheck=Date.now()+5000;
     }
    }catch(error){if(signal.aborted)throw error;registrationUnavailable=true;sourceVerified=false;sourceMessage='Source identity unavailable; keeping HUD open and retrying';nextOwnerCheck=Date.now()+5000;}
    const checkConfig=initial||reconcile||reasons.has('config'),stamp=checkConfig?inputStamp(cfgFile):cfgStamp;
    if(checkConfig&&(stamp!==cfgStamp||statusMessage)){try{config=loadConfig(cfgFile);cfgStamp=stamp;statusMessage='';nextGit=0;nextReconcile=Math.min(nextReconcile,Date.now()+get(config,'terminal.refreshMs'));if(nextHeartbeat)nextHeartbeat=Math.min(nextHeartbeat,Date.now()+get(config,'terminal.refreshMs'));dirty=true;}catch(error){statusMessage='Configuration reload failed: '+(error as Error).message;}}
    let readParent=initial||bindingChanged||reconcile||reasons.has('log'),readChildren=reconcile||reasons.has('child');
    if(selected){
     if(descriptor?.transcriptPath){if(!reader||knownPath!==descriptor.transcriptPath){knownPath=descriptor.transcriptPath;subscribe(knownPath,'log');reader=new SessionReader(knownPath,selected);readParent=true;}}
     else if(initial||reasons.has('discovery')||!reader&&reconcile||Date.now()>=nextDiscover){
      subscribe(root,'discovery',true);const session=await findSession(root,selected);nextDiscover=Date.now()+5000;
      if(!current()){reasons=new Set(['control']);continue;}
      if(session&&(!reader||session.path!==knownPath)){knownPath=session.path;subscribe(knownPath,'log');reader=new SessionReader(knownPath,session.id);selected=session.id;readParent=true;remove('log',new Set([knownPath]));}
     }
     if(reader&&readParent){try{parentSnapshot=await reader.read();}catch{parentSnapshot=structuredClone(parentSnapshot);parentSnapshot.errors=['Session log unavailable; showing stale telemetry and retrying'];}}
     if(!reader){parentSnapshot=emptySnapshot(selected);parentSnapshot.errors.push('Waiting for the selected session log');}
    }else{parentSnapshot=emptySnapshot('pending');parentSnapshot.errors.push(descriptor?.host?'Waiting for this Codex conversation':'Select the existing Codex session to display');}
    if(!current()){reasons=new Set(['control']);continue;}
    if(readParent||readChildren||reasons.has('discovery')){
     baseSnapshot=structuredClone(parentSnapshot);
     if(reader)await agentSessions.refresh(baseSnapshot,reader,{invalidate:readChildren,discover:reasons.has('discovery'),onFile:file=>subscribe(file,'child')});
     remove('child',new Set(agentSessions.files));
    }
    if(!reader||agentSessions.needsDiscovery)subscribe(root,'discovery',true);else remove('discovery',new Set());
    if(!current()){reasons=new Set(['control']);continue;}
    if(baseSnapshot.cwd&&(get(config,'gitStatus.enabled')||args.includes('--json'))){
     if(environmentCwd!==baseSnapshot.cwd||Date.now()>=nextGit){environment=await readEnvironmentAsync(baseSnapshot.cwd,signal);environmentCwd=baseSnapshot.cwd;nextGit=Date.now()+5000;}
    }else{environment=undefined;environmentCwd='';nextGit=Infinity;}
    if(!current()){reasons=new Set(['control']);continue;}
    const snapshot=structuredClone(baseSnapshot);if(environment)snapshot.environment=environment;if(statusMessage)snapshot.errors.push(statusMessage);if(sourceMessage)snapshot.errors.push(sourceMessage);
    const serialized=JSON.stringify(snapshot);dirty||=serialized!==telemetry;telemetry=serialized;
    const width=Number(option(args,'--width'))||process.stdout.columns||100,color=!args.includes('--no-color')&&!!process.stdout.isTTY;
    let rows=once?1000:process.stdout.rows||12;const geometry=JSON.stringify([width,rows]);dirty||=geometry!==lastGeometry;lastGeometry=geometry;
    if(dirty||Date.now()>=nextClock||Date.now()>=dynamicHeight.nextCheckAt){
     const at=Date.now();let result=render(snapshot,config,{width,height:rows,page,color,now:at});
     if(!once&&process.stdout.isTTY&&descriptor?.host&&sourceVerified){
      try{const fitted=await dynamicHeight.fit(descriptor,config,result.totalLines,at,{columns:width,rows},()=>current()&&(Number(option(args,'--width'))||process.stdout.columns||100)===width&&(process.stdout.rows||12)===rows,signal);
       if(fitted!==undefined&&fitted!==rows||dynamicHeight.awaitingGrowth){rows=fitted??rows;result=render(snapshot,config,{width,height:rows,page,color,now:at,showPager:!dynamicHeight.awaitingGrowth});}
      }catch(error){if(signal.aborted)throw error;dynamicHeight.nextCheckAt=Date.now()+5000;snapshot.errors.push('Automatic height unavailable; keeping the current pane size');result=render(snapshot,config,{width,height:rows,page,color,now:at});}
     }
     if(!current()){reasons=new Set(['control']);continue;}
     nextClock=nextDisplayAt(snapshot,config,at);
     const viewport={columns:process.stdout.columns??100,rows,contentRows:result.totalLines,pages:result.pages},viewportKey=JSON.stringify(viewport);
     if(descriptor&&!descriptor.demo&&viewportKey!==lastViewport){updateLaunch(ownedFile!,d=>{d.viewport=viewport;});lastViewport=viewportKey;}
     if(args.includes('--json'))console.log(JSON.stringify(snapshot));else if(!once&&process.stdout.isTTY){
      const height=process.stdout.rows||12,geometry=JSON.stringify([process.stdout.columns??100,height]);
      const output=frameUpdate(paintedLines,result.lines,height,paintInvalidated||geometry!==paintedGeometry,process.stdout.columns??100);
      if(output)process.stdout.write(output);paintedLines=result.lines.slice(0,height);paintedGeometry=geometry;paintInvalidated=false;
     }
     else console.log(result.lines.join('\n'));
    }
    if(once){exitReason='one-shot';break;}if(!process.stdout.isTTY){exitReason='noninteractive';break;}
    if(descriptor&&!descriptor.demo&&Date.now()>=nextHeartbeat){updateLaunch(ownedFile!,d=>{d.heartbeat=Date.now();});nextHeartbeat=Date.now()+get(config,'terminal.refreshMs');}
   }catch(error){if(!signal.aborted)throw error;if(quit)break;reasons=new Set(['control','config','log','geometry']);continue;}
   activeQuery=undefined;
   const deadline=Math.min(nextReconcile,descriptor?.host?nextOwnerCheck:Infinity,nextGit,nextHeartbeat||Infinity,nextClock,sourceVerified?dynamicHeight.nextCheckAt:Infinity);
   reasons=await events.wait(deadline);
  }
 }catch(error){bodyFailed=true;recordFailure(error);throw error;}finally{
  activeQuery?.abort();events.close();
  let cleanupFailed=false,cleanupError:unknown;const cleanup=(action:()=>void)=>{try{action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}};
  if(interactive){cleanup(()=>{process.stdin.off('keypress',onKey);});cleanup(()=>process.stdin.setRawMode(false));cleanup(()=>process.stdin.pause());}
  process.stdout.off('resize',onResize);
  if(!once&&process.stdout.isTTY)cleanup(()=>{process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');});
  if(cleanupFailed&&!bodyFailed)recordFailure(cleanupError);
  try{if(descriptor&&!descriptor.demo)updateLaunch(ownedFile!,d=>{d.state='exited';d.exitCode=exitReason==='error'?1:0;d.exitReason=exitReason;d.exitErrorCode=exitErrorCode;});}
  catch(error){if(!bodyFailed&&!cleanupFailed)throw error;}
  if(cleanupFailed&&!bodyFailed)throw cleanupError;
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
  const meta=await sessionMetadata(session.path);if(session.parentId||!isMainSession(meta,current,true)||meta?.id!==current)throw new Error('HUD requires main CLI conversation provenance; subagent and non-CLI transcripts are excluded');
  if(args.includes('--dry-run')){await ensureHostDisplay(record,loadConfig(configFile(args)),{role:'hook',dryRun:true});console.log(JSON.stringify({mode:'attach',backend:'psmux',status:'validated',ownerPane:record.proof.origin.pane}));return;}
  const result=await bindHostSession(record,current,session.path,{role:'hook',config:loadConfig(configFile(args)),configFile:configFile(args)});console.log('HUD '+result.status+'.');return;
 }
 const file=configFile(args);
 if(!args.includes('--dry-run')){
  const report=checkRuntime({configFile:file});if(!report.terminal)throw new Error(report.terminalCheck.status==='missing'?'Windows Terminal is missing; run doctor':report.terminalCheck.status==='timed-out'?'Windows Terminal lookup timed out; run doctor and retry':'Windows Terminal lookup failed'+(report.terminalCheck.code?' ('+report.terminalCheck.code+')':'')+'; run doctor');
 }
 if(args.includes('--')||option(args,'--cwd'))throw new Error('HUD attaches an existing session; no Codex launch arguments are accepted');
 const d=createLaunch(process.cwd(),loadConfig(file),runtimeRoot(file),file);
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
   console.log(JSON.stringify(checkRuntime({configFile:configFile(rest),launchFile:id?path.join(runtimeRoot(configFile(rest)),id+'.json'):undefined}),null,2));return;
  }
  case 'stop':{const id=option(rest,'--launch');if(!id||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('stop --launch <launch ID>');requestStop(path.join(runtimeRoot(configFile(rest)),id+'.json'));console.log('HUD stop requested; Codex keeps running');return;}
  case 'help':case '--help':case '-h':
   console.log('mz-codex-hud\n  start [--session CURRENT_ID]\n  watch|once [--session ID] [--json] [--width N]\n  list\n  setup --profile ABSOLUTE_PATH [--initialize] [--psmux ABSOLUTE_PATH] [--enable] [--apply] [--remove]\n  configure\n  config show | config set KEY VALUE\n  import-claude [--path CONFIG] [--yes]\n  doctor\n  demo [--duration MILLISECONDS]\n  stop --launch ID\nstart opens or reopens this conversation HUD; setup performs one-time initialization.\nAutomatic opening requires the configured PowerShell host entry. SessionStart binds current telemetry.\nNative statusline is unchanged. All commands accept --config FILE.');return;
  default:throw new Error('Unknown command: '+command);
 }
}
