import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {autoStart} from '../dist/autostart.js';import {defaultConfig,saveConfig,set} from '../dist/config.js';import {readLaunch,updateLaunch,requestStop} from '../dist/runtime.js';
function fixture(t,metadata={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-auto-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'current session.jsonl'),config=path.join(root,'config.json'),runtime=path.join(root,'runtime');fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'current-thread',session_id:'tree-root',cwd:root,source:'cli',base_instructions:{text:'SECRET INSTRUCTIONS'},...metadata}})+'\n');saveConfig(config,defaultConfig());return {root,file,config,runtime,event:{hook_event_name:'SessionStart',source:'startup',session_id:'tree-root',cwd:root,transcript_path:file},options:{configFile:config,runtimeDir:runtime,viewport:()=>undefined,launch:()=>{}}};}
const descriptors=dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>path.join(dir,n)):[];
test('autostart attaches metadata thread identity quietly and stores no transcript content',async t=>{
 const f=fixture(t);const result=await autoStart(f.event,f.options);assert.equal(result.status,'opened');const files=descriptors(f.runtime);assert.equal(files.length,1);const d=readLaunch(files[0]);assert.equal(d.sessionId,'current-thread');assert.equal(d.transcriptPath,f.file);assert.ok(!fs.readFileSync(files[0],'utf8').includes('SECRET'));
});
test('autostart applies content sizing before launching the exact selected session',async t=>{
 const f=fixture(t);let launched;
 await autoStart(f.event,{...f.options,viewport:()=>({columns:120,rows:40}),launch:d=>{launched=d;}});
 assert.equal(launched.initialSizing.mode,'content');assert.ok(launched.paneSize<0.22);
 assert.equal(launched.sessionId,'current-thread');assert.equal(launched.initialSizing.parentRows,40);
});
test('different main conversations in the same directory each own a HUD across all start sources',async t=>{
 const f=fixture(t),launched=[];
 const events=['startup','resume','clear','fork'].map((source,i)=>{
  const id='separate-thread-'+i,file=path.join(f.root,id+'.jsonl');fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,source:'cli'}})+'\n');
  return {hook_event_name:'SessionStart',source,session_id:id,transcript_path:file};
 });
 const results=await Promise.all(events.map(event=>autoStart(event,{...f.options,launch:d=>{launched.push(d.sessionId);}})));
 assert.deepEqual(results.map(r=>r.status),['opened','opened','opened','opened']);assert.equal(new Set(launched).size,4);assert.equal(descriptors(f.runtime).length,4);
 for(const event of events)assert.equal((await autoStart(event,f.options)).status,'already-open');
 assert.equal((await autoStart({...events[3],agent_id:'child'},f.options)).status,'ignored');
});
test('autostart skips disabled config, compact, subagents, non-CLI and mismatched transcripts',async t=>{
 const f=fixture(t);saveConfig(f.config,set(defaultConfig(),'startup.enabled',false));assert.equal((await autoStart(f.event,f.options)).status,'disabled');saveConfig(f.config,defaultConfig());
 for(const event of [{...f.event,source:'compact'},{...f.event,agent_id:'worker'}])assert.equal((await autoStart(event,f.options)).status,'ignored');
 for(const metadata of [{source:{subagent:{thread_spawn:{parent_thread_id:'parent'}}}},{source:'exec'},{id:'unrelated',session_id:'unrelated'}]){const g=fixture(t,metadata);assert.equal((await autoStart(g.event,g.options)).status,'ignored');assert.equal(descriptors(g.runtime).length,0);}
 assert.equal(descriptors(f.runtime).length,0);
});
test('autostart deduplicates pending/running displays and can reopen after closure',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const file=descriptors(f.runtime)[0];assert.equal((await autoStart({...f.event,source:'resume'},f.options)).status,'already-open');
 updateLaunch(file,d=>{d.state='running';d.pid=process.pid;d.heartbeat=Date.now();});assert.equal((await autoStart(f.event,f.options)).status,'already-open');requestStop(file);assert.equal((await autoStart(f.event,f.options)).status,'opened');assert.equal(descriptors(f.runtime).length,2);
});
test('a live HUD with a delayed heartbeat is not opened a second time',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const file=descriptors(f.runtime)[0];updateLaunch(file,d=>{d.state='running';d.pid=process.pid;d.heartbeat=Date.now()-60000;});assert.equal((await autoStart({...f.event,source:'resume'},f.options)).status,'already-open');assert.equal(descriptors(f.runtime).length,1);
});
test('an access-denied liveness probe does not create a duplicate of a recently active HUD',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const file=descriptors(f.runtime)[0];updateLaunch(file,d=>{d.state='running';d.pid=process.pid;d.heartbeat=Date.now();});const original=process.kill;process.kill=()=>{const error=new Error('access denied');error.code='EPERM';throw error;};try{assert.equal((await autoStart(f.event,f.options)).status,'already-open');}finally{process.kill=original;}assert.equal(descriptors(f.runtime).length,1);
});
test('concurrent autostart events create only one display descriptor',async t=>{
 const f=fixture(t);let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const first=autoStart(f.event,{...f.options,launch:async()=>{entered();await gate;}});await started;const second=await autoStart(f.event,f.options);assert.equal(second.status,'busy');release();assert.equal((await first).status,'opened');assert.equal(descriptors(f.runtime).length,1);
});
test('a failed pane launch cannot suppress a later valid autostart',async t=>{
 const f=fixture(t);await assert.rejects(()=>autoStart(f.event,{...f.options,launch:()=>{throw new Error('synthetic failure');}}));assert.equal(readLaunch(descriptors(f.runtime)[0]).state,'exited');assert.equal((await autoStart(f.event,f.options)).status,'opened');
});
test('manual dry-run metadata does not suppress the next automatic opening',{skip:process.platform!=='win32'},async t=>{
 const f=fixture(t);const result=spawnSync(process.execPath,['bin/hud.mjs','start','--session','current-thread','--sessions-root',f.root,'--config',f.config,'--dry-run'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,LOCALAPPDATA:f.root},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const pending=JSON.parse(result.stdout);assert.equal((await autoStart(f.event,{...f.options,runtimeDir:path.dirname(pending.launch)})).status,'opened');
});
test('the real hook entry emits no stdout on a successful opening',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);const local=path.join(f.root,'local');const cfg=path.join(local,'mz-codex-hud/config.json');saveConfig(cfg,defaultConfig());const marker=path.join(f.root,'launched.json');const entry=pathToFileURL(path.resolve(import.meta.dirname,'../hooks/session-start.mjs')).href;
 const script="import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.execFileSync=(command,args)=>{if(command!=='wt.exe')throw Error('Unexpected process');fs.writeFileSync("+JSON.stringify(marker)+",JSON.stringify(args));return Buffer.alloc(0);};syncBuiltinESMExports();await import("+JSON.stringify(entry)+");";
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{input:JSON.stringify(f.event),encoding:'utf8',env:{...process.env,LOCALAPPDATA:local}});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');const argv=JSON.parse(fs.readFileSync(marker,'utf8'));assert.ok(argv.includes('watch'));assert.ok(!argv.includes('--no-daemon'));assert.ok(!argv.includes('codex'));
});
test('Windows hook command expands the plugin path using the native cmd shell',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);const local=path.join(f.root,'local');saveConfig(path.join(local,'mz-codex-hud/config.json'),set(defaultConfig(),'startup.enabled',false));const hook=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../hooks/hooks.json'),'utf8')).hooks.SessionStart[0].hooks[0];
 const result=spawnSync(process.env.COMSPEC??'cmd.exe',['/D','/S','/C',hook.commandWindows??hook.command],{input:JSON.stringify(f.event),encoding:'utf8',windowsVerbatimArguments:true,env:{...process.env,LOCALAPPDATA:local,PLUGIN_ROOT:path.resolve(import.meta.dirname,'..')}});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
});
for(const shell of ['pwsh.exe','powershell.exe'])test('Windows hook locates a plugin with spaces and Unicode through '+shell,{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);const local=path.join(f.root,'local'),plugin=path.join(f.root,'plugin space 测试');
 saveConfig(path.join(local,'mz-codex-hud/config.json'),set(defaultConfig(),'startup.enabled',false));
 for(const dir of ['hooks','dist'])fs.cpSync(path.resolve(import.meta.dirname,'..',dir),path.join(plugin,dir),{recursive:true});
 fs.copyFileSync(path.resolve(import.meta.dirname,'../package.json'),path.join(plugin,'package.json'));
 const hook=JSON.parse(fs.readFileSync(path.join(plugin,'hooks/hooks.json'),'utf8')).hooks.SessionStart[0].hooks[0];
 const result=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-Command',hook.commandWindows??hook.command],{input:JSON.stringify(f.event),encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,LOCALAPPDATA:local,PLUGIN_ROOT:plugin}});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
 assert.equal(JSON.parse(fs.readFileSync(path.join(local,'mz-codex-hud/runtime/autostart-status.json'),'utf8')).status,'disabled');
});
