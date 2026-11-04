import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createLaunch,readLaunch,requestStop,buildTerminalArgs,selectSessionId} from '../dist/runtime.js';import {defaultConfig} from '../dist/config.js';
import {cleanEnvironment} from './support/clean-env.mjs';
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('session selection uses an explicit ID or the Codex-provided current thread without guessing',()=>{
 assert.equal(selectSessionId('explicit-thread',{CODEX_THREAD_ID:'current-thread'}),'explicit-thread');
 assert.equal(selectSessionId(undefined,{CODEX_THREAD_ID:'current-thread',CODEX_SESSION_ID:'tree-root'}),'current-thread');
 assert.equal(selectSessionId(undefined,{CODEX_SESSION_ID:'tree-root'}),'tree-root');
 assert.equal(selectSessionId(undefined,{}),undefined);assert.throws(()=>selectSessionId('../bad',{}));
});
test('a window name cannot prove an existing tab or pane and is rejected',t=>{
 const d=createLaunch(process.cwd(),defaultConfig(),temp(t));d.sessionId='current-thread';
 for(const window of ['last','0','target-window'])assert.throws(()=>buildTerminalArgs(d,window),/host|pane|psmux/i);
});
test('closing HUD never changes or ends the native Codex session',t=>{
 const d=createLaunch(process.cwd(),defaultConfig(),temp(t));requestStop(d.file);const value=readLaunch(d.file);assert.equal(value.hudStop,true);assert.equal(value.state,'created');assert.equal(value.exitCode,undefined);
});
test('ordinary start refuses an unknown physical host even with a valid current session',{skip:process.platform!=='win32'},t=>{
 const root=temp(t),home=path.join(root,'home');fs.mkdirSync(home);fs.writeFileSync(path.join(home,'config.toml'),'[features]\nhooks = false\n');fs.writeFileSync(path.join(root,'session.jsonl'),JSON.stringify({type:'session_meta',payload:{id:'current-thread',cwd:root}})+'\n');
 // Keep the unknown-host precondition even when the test runner itself is hosted.
 const result=spawnSync(process.execPath,['bin/hud.mjs','start','--sessions-root',root,'--dry-run'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,LOCALAPPDATA:root,CODEX_HOME:home,CODEX_THREAD_ID:'current-thread',MZ_HUD_ORIGIN:'',WT_WINDOW_ID:'unrelated-window'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/host|psmux|pane/i);
});
test('demo chooses its isolated home before Terminal starts',{skip:process.platform!=='win32'},t=>{
 const root=temp(t),result=spawnSync(process.execPath,['bin/hud.mjs','demo','--dry-run','--duration','1000'],{cwd:path.resolve(import.meta.dirname,'..'),env:cleanEnvironment(root),encoding:'utf8'});assert.equal(result.status,0,result.stderr);const info=JSON.parse(result.stdout);const d=readLaunch(info.launch);assert.ok(d.codexHome.startsWith(path.dirname(d.file)));assert.ok(d.file.startsWith(root+path.sep));
});
