import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {registerHost} from '../dist/host-session.js';
import {createLaunch,updateLaunch} from '../dist/runtime.js';
import {defaultConfig,set,saveConfig} from '../dist/config.js';
import {copyObserverRuntime} from './support/native-observer-fixture.mjs';

function probe(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-background-viewer-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
 const origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(root,'runtime/hosts'),namespace:'mzhud-background',tmux:'/tmp/psmux-101/mzhud-background,53001,0',session:'codex',pane:'%1',originId:'00112233-4455-4677-8899-aabbccddeeff'};
 const owner={pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'};
 const host=registerHost({origin,owner,server,window:'@1'},origin.hostDir,root),configFile=path.join(root,'config.json');
 let config=set(set(set(defaultConfig(),'terminal.refreshMs',1000),'display.showModel',true),'gitStatus.enabled',false);config=set(config,'terminal.dynamicHeight',mode==='geometry'||mode==='pending');
 if(mode==='pending')config=set(set(set(config,'display.customLine','x'.repeat(600)),'display.customLinePosition','last'),'display.showContextBar',false);
 saveConfig(configFile,config);
 const d=createLaunch(root,config,path.join(root,'runtime'),configFile),transcript=path.join(root,'session.jsonl');
 fs.writeFileSync(transcript,JSON.stringify({type:'session_meta',payload:{id:'background-thread',cwd:root}})+'\n');
 host.launchFile=d.file;fs.writeFileSync(host.file,JSON.stringify(host));
 updateLaunch(d.file,v=>{v.sessionId='background-thread';v.transcriptPath=transcript;v.sessionsRoot=root;v.codexHome=path.join(root,'empty-home');v.host={recordFile:host.file,proof:host.proof,phase:'running',hudPane:'%2'};});
 const runtime=path.join(root,'dist'),dist=path.resolve(import.meta.dirname,'../dist');fs.cpSync(dist,runtime,{recursive:true});copyObserverRuntime(dist,runtime);
 const script=path.join(root,'probe.mjs'),result=path.join(root,'result.json'),fixture=pathToFileURL(path.resolve(import.meta.dirname,'support/native-observer-fixture.mjs')).href;
 fs.writeFileSync(script,`
import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {installNativeObserverFixture} from ${JSON.stringify(fixture)};
import {frameScreen} from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname,'support/frame-screen.mjs')).href)};
const host=${JSON.stringify(host)},file=${JSON.stringify(d.file)},transcript=${JSON.stringify(transcript)},mode=${JSON.stringify(mode)};
const self={pid:process.pid,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z'},facts=[host.proof.owner,host.proof.server,self],resizes=[];
const original=cp.execFileSync;
cp.execFileSync=(binary,args,options)=>{
 if(String(binary).toLowerCase()==='powershell.exe'&&args.some(a=>String(a).endsWith('process-facts.ps1')))return JSON.stringify(facts);
 if(binary===host.proof.origin.binary){const pane=args[args.indexOf('-t')+1];return 'codex\\t@1\\t'+pane+'\\t'+(pane==='%1'?201:process.pid)+'\\t120\\t12\\t101';}
 return original(binary,args,options);
};
cp.execFile=(binary,args,options,callback)=>{
 const slow=mode==='identity'&&args.includes('-IdentitiesOnly')||['geometry','pending'].includes(mode)&&binary===host.proof.origin.binary&&args.includes('list-panes');
 if(slow){if(mode==='pending'){geometryStartedAt=performance.now();stop=setTimeout(()=>{stoppedAt=performance.now();updateLaunch(file,v=>v.hudStop=true);},650);append=setTimeout(()=>fs.appendFileSync(transcript,JSON.stringify({type:'turn_context',payload:{model:'NEW-BACKGROUND-MODEL'}})+'\\n'),30);}const timer=setTimeout(()=>callback(null,JSON.stringify(facts),''),3000);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);callback(Object.assign(Error('cancelled'),{name:'AbortError'}),'','');},{once:true});return {};}
 if(binary===host.proof.origin.binary&&args.includes('resize-pane'))resizes.push(args);
 try{const raw=cp.execFileSync(binary,args,options);queueMicrotask(()=>callback(null,raw,''));}catch(error){queueMicrotask(()=>callback(error,'',''));}return {};
};syncBuiltinESMExports();
installNativeObserverFixture({facts,readyDelay:mode==='identity'?3000:0,onSpawn:()=>{observerSpawnAt??=performance.now()-started;}});
const {main}=await import(${JSON.stringify(pathToFileURL(path.join(runtime,'cli.js')).href)}),{updateLaunch,readLaunch}=await import(${JSON.stringify(pathToFileURL(path.join(runtime,'runtime.js')).href)});
updateLaunch(file,v=>{v.pid=process.pid;v.host.hudProcess=self;});
Object.assign(process.env,{MZ_HUD_ORIGIN:host.id,MZ_HUD_PSMUX:host.proof.origin.binary,MZ_HUD_HOST_DIR:host.proof.origin.hostDir,MZ_HUD_NAMESPACE:host.proof.origin.namespace,PSMUX_DATA_DIR:host.proof.origin.dataDir,TMUX:host.proof.origin.tmux,TMUX_PANE:'%2',PSMUX_SESSION:'codex'});
Object.defineProperties(process.stdout,{isTTY:{value:true},columns:{value:120,writable:true},rows:{value:mode==='pending'?3:12,writable:true}});
const frames=[],screens=[],screen=frameScreen(),started=performance.now();let firstPaintMs,visibleMs,stoppedAt,geometryStartedAt,append,observerSpawnAt;
process.stdout.write=value=>{const text=String(value);if(/\\x1b\\[\\d+;1H/.test(text)){firstPaintMs??=performance.now()-started;frames.push(text);screens.push({text:screen(text),geometryPending:geometryStartedAt!==undefined});if(text.includes('NEW-BACKGROUND-MODEL'))visibleMs=performance.now()-started;}return true;};
if(mode!=='pending')append=setTimeout(()=>fs.appendFileSync(transcript,JSON.stringify({type:'turn_context',payload:{model:'NEW-BACKGROUND-MODEL'}})+'\\n'),120);
let stop;if(mode!=='pending')stop=setTimeout(()=>{stoppedAt=performance.now();updateLaunch(file,v=>v.hudStop=true);},650);
try{await main(['watch','--launch',file,'--no-color']);}finally{clearTimeout(append);clearTimeout(stop);}
fs.writeFileSync(${JSON.stringify(result)},JSON.stringify({frames,screens,firstPaintMs,visibleMs,observerSpawnAt,geometryStartedMs:geometryStartedAt===undefined?undefined:geometryStartedAt-started,stopLatency:performance.now()-stoppedAt,resizes,descriptor:readLaunch(file)}));
`);
 const env={...process.env};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
 const child=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000,env});assert.equal(child.status,0,child.stderr);
 return JSON.parse(fs.readFileSync(result,'utf8'));
}

for(const mode of ['identity','geometry'])test('a stalled '+mode+' check cannot hold telemetry, stop or authorize a resize',t=>{
 const r=probe(t,mode);
 assert.ok(r.firstPaintMs<800,JSON.stringify(r));assert.ok(r.visibleMs<800,JSON.stringify(r));assert.ok(r.stopLatency<800,JSON.stringify(r));
 assert.ok(r.firstPaintMs<=r.observerSpawnAt,JSON.stringify(r));
 assert.ok(r.frames.some(frame=>frame.includes('NEW-BACKGROUND-MODEL')));assert.deepEqual(r.resizes,[]);assert.equal(r.descriptor.exitReason,'stop-requested');
});

test('a pending height assessment does not flash a pager before growth capacity is known',t=>{
 const r=probe(t,'pending'),pending=r.screens.filter(s=>s.geometryPending&&s.text.includes('NEW-BACKGROUND-MODEL'));
 assert.ok(pending.length>0,JSON.stringify(r));assert.ok(r.visibleMs-r.geometryStartedMs<800,JSON.stringify(r));assert.ok(pending.every(s=>!s.text.includes('←/→ page')),JSON.stringify(pending));assert.deepEqual(r.resizes,[]);
});
