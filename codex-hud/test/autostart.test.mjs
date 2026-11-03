import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {autoStart} from '../dist/autostart.js';import {defaultConfig,saveConfig,set} from '../dist/config.js';import {readLaunch,updateLaunch,requestStop} from '../dist/runtime.js';
import {hostFixture} from './support/host-fixture.mjs';
function fixture(t,metadata={}){
 const f=hostFixture(t),{root,runtime}=f,file=path.join(root,'current session.jsonl'),config=path.join(root,'config.json');
 fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'current-thread',session_id:'tree-root',cwd:root,source:'cli',base_instructions:{text:'SECRET INSTRUCTIONS'},...metadata}})+'\n');saveConfig(config,defaultConfig());
 return {...f,file,config,event:{hook_event_name:'SessionStart',source:'startup',session_id:'tree-root',cwd:root,transcript_path:file},options:{configFile:config,environment:f.environment,dependencies:f.dependencies}};
}
const descriptors=dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>path.join(dir,n)):[];
test('autostart attaches metadata thread identity quietly and stores no transcript content',async t=>{
 const f=fixture(t);const result=await autoStart(f.event,f.options);assert.equal(result.status,'opened');const files=descriptors(f.runtime);assert.equal(files.length,1);const d=readLaunch(files[0]);assert.equal(d.sessionId,'current-thread');assert.equal(d.transcriptPath,f.file);assert.ok(!fs.readFileSync(files[0],'utf8').includes('SECRET'));
});
test('autostart sizes using its exact source pane geometry',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const launched=readLaunch(descriptors(f.runtime)[0]);
 assert.equal(launched.initialSizing.mode,'rows');assert.equal(launched.initialSizing.rows,6);assert.equal(launched.initialSizing.parentRows,40);assert.equal(launched.sessionId,'current-thread');
});
test('parallel frontends in the same directory each own a HUD across all start sources',async t=>{
 const first=fixture(t),fixtures=['startup','resume','clear','fork'].map((source,i)=>{
  const f=fixture(t,{id:'separate-thread-'+i,cwd:first.root});f.event.source=source;return f;
 });
 const results=await Promise.all(fixtures.map(f=>autoStart(f.event,f.options)));assert.deepEqual(results.map(r=>r.status),['opened','opened','opened','opened']);
 for(const f of fixtures){assert.equal(descriptors(f.runtime).length,1);assert.equal((await autoStart(f.event,f.options)).status,'already-open');}
 assert.equal((await autoStart({...fixtures[3].event,agent_id:'child'},fixtures[3].options)).status,'ignored');
});
test('autostart skips disabled config, compact, subagents, non-CLI and mismatched transcripts',async t=>{
 const f=fixture(t);saveConfig(f.config,set(defaultConfig(),'startup.enabled',false));assert.equal((await autoStart(f.event,f.options)).status,'disabled');saveConfig(f.config,defaultConfig());
 for(const event of [{...f.event,source:'compact'},{...f.event,agent_id:'worker'}])assert.equal((await autoStart(event,f.options)).status,'ignored');
 for(const metadata of [{source:{subagent:{thread_spawn:{parent_thread_id:'parent'}}}},{source:'exec'},{id:'unrelated',session_id:'unrelated'}]){const g=fixture(t,metadata);assert.equal((await autoStart(g.event,g.options)).status,'ignored');assert.equal(descriptors(g.runtime).length,0);}
 assert.equal(descriptors(f.runtime).length,0);
});
test('exact-host startup can be enabled while legacy unsafe startup stays paused',async t=>{
 const f=fixture(t),config=set(set(defaultConfig(),'startup.enabled',false),'host.autoStart','enabled');saveConfig(f.config,config);
 assert.equal((await autoStart(f.event,f.options)).status,'opened');assert.equal(JSON.parse(fs.readFileSync(f.config,'utf8')).startup.enabled,false);
 saveConfig(f.config,set(set(config,'startup.enabled',true),'host.autoStart','disabled'));assert.equal((await autoStart(f.event,f.options)).status,'disabled');assert.equal(f.state.splits,1);
});
test('autostart deduplicates a live display and waits for its exact process before reopening',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const file=descriptors(f.runtime)[0];assert.equal((await autoStart({...f.event,source:'resume'},f.options)).status,'already-open');
 requestStop(file);assert.equal((await autoStart(f.event,f.options)).reason,'hud-stopping');
 updateLaunch(file,d=>{d.state='exited';});f.state.viewers=[];
 assert.equal((await autoStart(f.event,f.options)).status,'opened');assert.equal(descriptors(f.runtime).length,2);
});
test('a live HUD with a delayed heartbeat is not opened a second time',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);const file=descriptors(f.runtime)[0];updateLaunch(file,d=>{d.heartbeat=Date.now()-60000;});assert.equal((await autoStart({...f.event,source:'resume'},f.options)).status,'already-open');assert.equal(descriptors(f.runtime).length,1);
});
test('unavailable process identity cannot create a duplicate HUD',async t=>{
 const f=fixture(t);await autoStart(f.event,f.options);
 const result=await autoStart(f.event,{...f.options,dependencies:{...f.dependencies,processes:()=>{throw Error('Access denied');}}});
 assert.equal(result.reason,'unproven-host');assert.equal(descriptors(f.runtime).length,1);assert.equal(f.state.splits,1);
});
test('concurrent hook events create only one display descriptor',async t=>{
 const f=fixture(t);f.state.delay=true;const first=autoStart(f.event,f.options);
 while(!f.state.pending)await new Promise(r=>setTimeout(r,5));
 const second=await autoStart(f.event,f.options);assert.equal(second.status,'busy');f.ack();assert.equal((await first).status,'opened');assert.equal(descriptors(f.runtime).length,1);
});
test('a lost pane result remains uncertain rather than blindly opening again',async t=>{
 const f=fixture(t),real=f.dependencies.run;f.dependencies.run=args=>{if(args[2]==='split-window')throw Error('response lost');return real(args);};
 await assert.rejects(()=>autoStart(f.event,f.options),/lost/);assert.equal(readLaunch(descriptors(f.runtime)[0]).host.phase,'uncertain');
 await assert.rejects(()=>autoStart(f.event,f.options),/uncertain|pending/);assert.equal(descriptors(f.runtime).length,1);
});
test('manual start outside an exact host cannot suppress the next proven hook',{skip:process.platform!=='win32'},async t=>{
 const f=fixture(t);const env={...process.env,LOCALAPPDATA:f.root};delete env.MZ_HUD_ORIGIN;
 const result=spawnSync(process.execPath,['bin/hud.mjs','start','--session','current-thread','--sessions-root',f.root,'--config',f.config,'--dry-run'],{cwd:path.resolve(import.meta.dirname,'..'),env,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.equal(descriptors(f.runtime).length,0);assert.equal((await autoStart(f.event,f.options)).status,'opened');
});
test('the real hook is quiet and creates nothing when physical origin is unavailable',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),local=path.join(f.root,'local');saveConfig(path.join(local,'mz-codex-hud/config.json'),defaultConfig());
 const env={...process.env,LOCALAPPDATA:local};delete env.MZ_HUD_ORIGIN;
 const result=spawnSync(process.execPath,['hooks/session-start.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),input:JSON.stringify(f.event),encoding:'utf8',env});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(JSON.parse(fs.readFileSync(path.join(local,'mz-codex-hud/runtime/autostart-status.json'),'utf8')).reason,'unproven-host');
 assert.equal(descriptors(path.join(local,'mz-codex-hud/runtime')).length,0);
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
