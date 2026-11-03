import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {createLaunch,updateLaunch} from '../dist/runtime.js';import {defaultConfig,set,saveConfig} from '../dist/config.js';
test('watch retains last valid telemetry during one read failure and recovers the same file on the next frame',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const cfg=path.join(root,'config.json');saveConfig(cfg,set(set(defaultConfig(),'terminal.refreshMs',250),'display.showModel',true));const d=createLaunch(root,defaultConfig(),root,cfg);updateLaunch(d.file,v=>v.sessionId='recovery-session');
 const row=(type,payload)=>JSON.stringify({type,payload})+'\n';fs.writeFileSync(path.join(root,'session.jsonl'),row('session_meta',{id:'recovery-session'})+row('turn_context',{model:'recovery-model'}));
 const imports=['cli','reader','runtime'].map(x=>pathToFileURL(path.resolve(import.meta.dirname,'../dist/'+x+'.js')).href);const out=path.join(root,'result.json');const script=path.join(root,'probe.mjs');
 fs.writeFileSync(script,`import fs from 'node:fs';import {main} from ${JSON.stringify(imports[0])};import {SessionReader} from ${JSON.stringify(imports[1])};import {updateLaunch} from ${JSON.stringify(imports[2])};
 const file=${JSON.stringify(d.file)},root=${JSON.stringify(root)};let reads=0;const original=SessionReader.prototype.read;SessionReader.prototype.read=async function(){reads++;if(reads===2)throw new Error('temporary lock');return original.call(this);};
 Object.defineProperty(process.stdout,'isTTY',{value:true});const frames=[];process.stdout.write=(value)=>{if(String(value).includes('\\x1b[H\\x1b[2J')){frames.push(String(value));if(frames.length===3)updateLaunch(file,d=>d.hudStop=true);}return true;};
 await main(['watch','--launch',file,'--sessions-root',root,'--no-color']);fs.writeFileSync(${JSON.stringify(out)},JSON.stringify({reads,frames}));`);
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const {reads,frames}=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(reads,3);assert.match(frames[1],/recovery-model/);assert.match(frames[1],/unavailable|stale/);assert.match(frames[2],/recovery-model/);assert.ok(!frames[2].includes('Waiting for the selected'));
});
test('rebinding an existing display discards all stale telemetry from the old thread',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-rebind-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const cfg=path.join(root,'config.json');saveConfig(cfg,set(set(defaultConfig(),'terminal.refreshMs',250),'display.showModel',true));
 const first=path.join(root,'first.jsonl'),second=path.join(root,'second.jsonl'),row=(type,payload)=>JSON.stringify({type,payload})+'\n';
 fs.writeFileSync(first,row('session_meta',{id:'first-thread'})+row('turn_context',{model:'OLD-THREAD-MODEL'}));
 fs.writeFileSync(second,row('session_meta',{id:'second-thread'})+row('turn_context',{model:'NEW-THREAD-MODEL'}));
 const d=createLaunch(root,defaultConfig(),root,cfg);updateLaunch(d.file,v=>{v.sessionId='first-thread';v.transcriptPath=first;});
 const imports=['cli','reader','runtime'].map(x=>pathToFileURL(path.resolve(import.meta.dirname,'../dist/'+x+'.js')).href),out=path.join(root,'result.json'),script=path.join(root,'probe.mjs');
 fs.writeFileSync(script,`import fs from 'node:fs';import {main} from ${JSON.stringify(imports[0])};import {SessionReader} from ${JSON.stringify(imports[1])};import {updateLaunch} from ${JSON.stringify(imports[2])};
 const file=${JSON.stringify(d.file)};const original=SessionReader.prototype.read;let reads=0;SessionReader.prototype.read=async function(){if(++reads===2)throw Error('new file temporarily locked');return original.call(this);};
 Object.defineProperty(process.stdout,'isTTY',{value:true});const frames=[];process.stdout.write=value=>{if(String(value).includes('\\x1b[H\\x1b[2J')){frames.push(String(value));if(frames.length===1)updateLaunch(file,d=>{d.sessionId='second-thread';d.transcriptPath=${JSON.stringify(second)};});if(frames.length===3)updateLaunch(file,d=>d.hudStop=true);}return true;};
 await main(['watch','--launch',file,'--no-color']);fs.writeFileSync(${JSON.stringify(out)},JSON.stringify(frames));`);
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const frames=JSON.parse(fs.readFileSync(out,'utf8'));
 assert.match(frames[0],/OLD-THREAD-MODEL/);assert.ok(!frames[1].includes('OLD-THREAD-MODEL'));assert.match(frames[2],/NEW-THREAD-MODEL/);
});
