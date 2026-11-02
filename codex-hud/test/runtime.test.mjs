import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createLaunch,bindLaunch,readLaunch,requestStop,buildTerminalArgs,decodeArgs,validateCodexArgs,runCodex} from '../dist/runtime.js';import {defaultConfig} from '../dist/config.js';
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('launch binding separates concurrent same-cwd sessions and rejects subagents or rebinding',t=>{
 const root=temp(t),a=createLaunch(process.cwd(),defaultConfig(),root),b=createLaunch(process.cwd(),defaultConfig(),root);assert.notEqual(a.id,b.id);
 assert.equal(bindLaunch(a.file,{session_id:'session-one',cwd:process.cwd(),hook_event_name:'SessionStart'}),true);
 assert.equal(bindLaunch(b.file,{session_id:'session-two',cwd:process.cwd(),hook_event_name:'SessionStart'}),true);
 assert.equal(bindLaunch(a.file,{session_id:'session-two',cwd:process.cwd()}),false);assert.equal(readLaunch(a.file).sessionId,'session-one');
 assert.equal(bindLaunch(b.file,{session_id:'child',cwd:process.cwd(),agent_id:'worker'}),false);
 const c=createLaunch(process.cwd(),defaultConfig(),root);assert.equal(bindLaunch(c.file,{session_id:'wrong',cwd:path.dirname(process.cwd())}),false);
});
test('launch command safely encodes user args and persists no prompt or command arguments',t=>{
 const root=temp(t),d=createLaunch(process.cwd(),defaultConfig(),root);const input=['--model','模型 a','literal; split-pane','quote" & $(no-op)'];const args=buildTerminalArgs(d,input);
 assert.deepEqual(decodeArgs(args[args.indexOf('--argv')+1]),input);assert.ok(!fs.readFileSync(d.file,'utf8').includes('no-op'));assert.ok(args.includes('--horizontal'));assert.deepEqual(args.slice(-3),['focus-pane','-t','0']);
 assert.throws(()=>decodeArgs('bad'),/argv/i);assert.throws(()=>validateCodexArgs(['--remote','ws://example']),/remote/i);
});
test('HUD stop requests never mark the Codex session exited or kill a process',t=>{
 const root=temp(t),d=createLaunch(process.cwd(),defaultConfig(),root);requestStop(d.file);const value=readLaunch(d.file);assert.equal(value.hudStop,true);assert.equal(value.state,'created');assert.equal(value.exitCode,undefined);assert.throws(()=>readLaunch(path.join(root,'missing.json')));
});
test('Terminal bootstrap survives the observed Windows Terminal double-quote normalization',t=>{
 const d=createLaunch(process.cwd(),defaultConfig(),temp(t));const args=buildTerminalArgs(d,[]);const script=args[args.indexOf('-e')+1].replace(/"/g,'');const encoded=args[args.indexOf('-e')+2];
 const result=spawnSync(process.execPath,['-e',script,encoded,'help'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/mz-codex-hud/);
});
test('demo selects its isolated telemetry home before Terminal can start the watcher',{skip:process.platform!=='win32'},t=>{
 const result=spawnSync(process.execPath,['bin/hud.mjs','demo','--dry-run','--duration','1000'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,LOCALAPPDATA:temp(t)},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const info=JSON.parse(result.stdout);const d=readLaunch(info.launch);assert.ok(d.codexHome.startsWith(path.dirname(d.file)));assert.ok(d.codexHome.includes(d.id));
});
test('runner preserves literal argument boundaries, exit code and private launch environment',async t=>{
 const root=temp(t),d=createLaunch(process.cwd(),defaultConfig(),root);const result=path.join(root,'result.json'),script=path.join(root,'fake.mjs');
 fs.writeFileSync(script,"import fs from 'node:fs';fs.writeFileSync(process.argv[2],JSON.stringify({args:process.argv.slice(3),launch:process.env.MZ_CODEX_HUD_LAUNCH}));process.exitCode=7;");
 const code=await runCodex(d,['one;two','空 格','"quoted"'],{command:process.execPath,args:[script,result],isolated:false});assert.equal(code,7);const received=JSON.parse(fs.readFileSync(result,'utf8'));assert.deepEqual(received.args,['one;two','空 格','"quoted"']);assert.equal(received.launch,d.file);assert.equal(readLaunch(d.file).state,'exited');assert.equal(readLaunch(d.file).exitCode,7);
});
test('runner resolves Codex from the received invoking-shell PATH rather than the Terminal PATH',async t=>{
 const root=temp(t),d=createLaunch(process.cwd(),defaultConfig(),root);const caller=path.join(root,'caller'),terminal=path.join(root,'terminal'),out=path.join(root,'selected.txt');
 for(const [dir,label]of [[caller,'caller'],[terminal,'terminal']]){const script=path.join(dir,'node_modules/@openai/codex/bin/codex.js');fs.mkdirSync(path.dirname(script),{recursive:true});fs.writeFileSync(script,"require('node:fs').writeFileSync("+JSON.stringify(out)+","+JSON.stringify(label)+");");}
 const old=process.env.PATH;process.env.PATH=terminal;try{const code=await runCodex(d,[],undefined,{Path:caller});assert.equal(code,0);assert.equal(fs.readFileSync(out,'utf8'),'caller');}finally{process.env.PATH=old;}
});
