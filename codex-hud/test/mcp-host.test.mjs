import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {hostFixture} from './support/host-fixture.mjs';import {defaultConfig} from '../dist/config.js';import {readLaunch} from '../dist/runtime.js';
const api=await import('../dist/host-session.js').catch(()=>({}));
async function fixture(t){
 const f=hostFixture(t),initial=f.dependencies.processes(),app={pid:901,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.100Z'};
 f.record.proof.appServer={endpoint:'ws://127.0.0.1:12345',process:app};fs.writeFileSync(f.record.file,JSON.stringify(f.record));
 f.dependencies.processes=()=>[...initial.map(p=>p.pid===401?{...p,parentPid:901}:p),app,...f.state.viewers];
 const opened=await api.ensureHostDisplay(f.record,defaultConfig(),{role:'hook',dependencies:f.dependencies,binding:{id:'thread-a',transcript:path.join(f.root,'session.jsonl')}}),d=readLaunch(opened.launchFile);
 return {...f,d,viewer:{...f.dependencies,pid:d.pid},initial,app};
}
test('a runtime observer requires the registered physical viewer and live owner, frontend and server',async t=>{
 assert.equal(typeof api.verifyRuntimeHost,'function');const f=await fixture(t);assert.equal(api.verifyRuntimeHost(f.d,f.viewer).proof.appServer.endpoint,'ws://127.0.0.1:12345');
 for(const excluded of [201,301,901,f.d.pid])assert.throws(()=>api.verifyRuntimeHost(f.d,{...f.viewer,processes:()=>f.dependencies.processes().filter(p=>p.pid!==excluded)}),/viewer|owner|frontend|server|process|incarnation/i);
 assert.throws(()=>api.verifyRuntimeHost(f.d,{...f.viewer,pid:999}),/viewer/i);
});
test('runtime observations reject a changed registration or a stale app-server incarnation',async t=>{
 assert.equal(typeof api.verifyRuntimeHost,'function');const f=await fixture(t),record=api.readHost(f.record.file);
 record.proof.appServer={...record.proof.appServer,process:{...f.app,startedAt:'2026-11-03T01:00:02.200Z'}};fs.writeFileSync(record.file,JSON.stringify(record));assert.throws(()=>api.verifyRuntimeHost(f.d,f.viewer),/server|runtime|incarnation/i);
 record.proof.appServer={endpoint:'ws://127.0.0.1:12345',process:f.app};record.state='closed';fs.writeFileSync(record.file,JSON.stringify(record));assert.throws(()=>api.verifyRuntimeHost(f.d,f.viewer),/closed|registration|current/i);
});
test('runtime observations reject changed backend paths before executing a registration command',async t=>{
 assert.equal(typeof api.verifyRuntimeHost,'function');const f=await fixture(t),record=api.readHost(f.record.file);record.proof.origin.binary=path.join(f.root,'foreign.exe');fs.writeFileSync(record.file,JSON.stringify(record));let executed=0;
 assert.throws(()=>api.verifyRuntimeHost(f.d,{...f.viewer,run:args=>{executed++;return f.viewer.run(args);}}),/path|registration/i);assert.equal(executed,0);
});
