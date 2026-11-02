import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createLaunch,readLaunch,requestStop,buildTerminalArgs,selectSessionId} from '../dist/runtime.js';import {defaultConfig} from '../dist/config.js';
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('session selection uses an explicit ID or the Codex-provided current thread without guessing',()=>{
 assert.equal(selectSessionId('explicit-thread',{CODEX_THREAD_ID:'current-thread'}),'explicit-thread');
 assert.equal(selectSessionId(undefined,{CODEX_THREAD_ID:'current-thread',CODEX_SESSION_ID:'tree-root'}),'current-thread');
 assert.equal(selectSessionId(undefined,{CODEX_SESSION_ID:'tree-root'}),'tree-root');
 assert.equal(selectSessionId(undefined,{}),undefined);assert.throws(()=>selectSessionId('../bad',{}));
});
test('passive Terminal attachment starts only the HUD and preserves its fixed session',t=>{
 const d=createLaunch(process.cwd(),defaultConfig(),temp(t));d.sessionId='current-thread';const args=buildTerminalArgs(d,'target-window');
 assert.deepEqual(args.slice(0,4),['-w','target-window','split-pane','--horizontal']);assert.ok(args.includes('watch'));assert.ok(!args.includes('runner'));assert.ok(!args.includes('new-tab'));assert.ok(!args.includes('--no-daemon'));
 const script=args[args.indexOf('-e')+1].replace(/"/g,'');const encoded=args[args.indexOf('-e')+2];const result=spawnSync(process.execPath,['-e',script,encoded,'help'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('closing HUD never changes or ends the native Codex session',t=>{
 const d=createLaunch(process.cwd(),defaultConfig(),temp(t));requestStop(d.file);const value=readLaunch(d.file);assert.equal(value.hudStop,true);assert.equal(value.state,'created');assert.equal(value.exitCode,undefined);
});
test('start inherits the current Codex ID with hooks disabled and without a Codex launcher',{skip:process.platform!=='win32'},t=>{
 const root=temp(t),home=path.join(root,'home');fs.mkdirSync(home);fs.writeFileSync(path.join(home,'config.toml'),'[features]\nhooks = false\n');fs.writeFileSync(path.join(root,'session.jsonl'),JSON.stringify({type:'session_meta',payload:{id:'current-thread',cwd:root}})+'\n');
 const result=spawnSync(process.execPath,['bin/hud.mjs','start','--sessions-root',root,'--dry-run'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,LOCALAPPDATA:root,CODEX_HOME:home,CODEX_THREAD_ID:'current-thread'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const info=JSON.parse(result.stdout);assert.equal(info.sessionId,'current-thread');assert.equal(info.mode,'attach');assert.equal(info.hooksRequired,false);
 const d=readLaunch(info.launch);assert.equal(d.sessionId,'current-thread');
});
test('demo chooses its isolated home before Terminal starts',{skip:process.platform!=='win32'},t=>{
 const result=spawnSync(process.execPath,['bin/hud.mjs','demo','--dry-run','--duration','1000'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,LOCALAPPDATA:temp(t)},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const info=JSON.parse(result.stdout);const d=readLaunch(info.launch);assert.ok(d.codexHome.startsWith(path.dirname(d.file)));
});
