import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {defaultConfig} from '../dist/config.js';import {readLaunch,updateLaunch} from '../dist/runtime.js';
const api=await import('../dist/host-session.js').catch(()=>({}));
function fixture(t,id='00112233-4455-4677-8899-aabbccddeeff'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-host-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(root,'hosts'),namespace:'mzhud-test',tmux:'/tmp/psmux-101/mzhud-test,53001,0',session:'codex',pane:'%1',originId:id};
 const owner={pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'};
 const state={splits:0,viewers:[],uncertain:false};const proof={origin,owner,server,window:'@1'};
 const dependencies={pid:201,processes:()=>[owner,server,...state.viewers],run:args=>{
  assert.deepEqual(args.slice(0,2),['-L','mzhud-test']);
  if(args[2]==='display-message'){
   const pane=args[args.indexOf('-t')+1];if(pane==='%1')return 'codex\t@1\t%1\t201\t120\t40\t101';
   const view=state.viewers.find(p=>p.pane===pane);if(!view)throw Error('pane no longer exists');return `codex\t@1\t${pane}\t${view.pid}\t120\t4\t101`;
  }
  assert.equal(args[2],'split-window');state.splits++;if(state.uncertain)throw Error('response lost after creation');
  const file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString(),view={pid:500+state.splits,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z',pane:'%'+(6+state.splits)};state.viewers.push(view);
  updateLaunch(file,d=>{d.state='running';d.pid=view.pid;d.host.hudPane=view.pane;d.host.hudProcess={pid:view.pid,parentPid:view.parentPid,name:view.name,startedAt:view.startedAt};d.host.phase='running';});return view.pane;
 }};
 return {root,proof,state,dependencies,options:{dependencies,waitMs:10},record:()=>api.registerHost(proof,origin.hostDir,root)};
}
test('bootstrap opens its own waiting HUD without any session log or model request',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','owner-bound display lifecycle is missing');
 const f=fixture(t),record=f.record();const result=await api.ensureHostDisplay(record,defaultConfig(),f.options);
 assert.equal(result.status,'opened');const d=readLaunch(result.launchFile);assert.equal(d.sessionId,undefined);assert.equal(d.transcriptPath,undefined);assert.equal(d.host.proof.owner.pid,201);assert.equal(d.host.hudPane,'%7');
 assert.equal((await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options)).status,'already-open');assert.equal(f.state.splits,1);
});
test('two physical owners of the same resumed thread retain independent displays',async t=>{
 assert.equal(typeof api.bindHostSession,'function','owner-specific data binding is missing');
 const a=fixture(t),b=fixture(t,'11112233-4455-4677-8899-aabbccddeeff');
 const one=await api.bindHostSession(a.record(),'same-thread',path.join(a.root,'a.jsonl'),{...a.options,config:defaultConfig()});
 const two=await api.bindHostSession(b.record(),'same-thread',path.join(b.root,'b.jsonl'),{...b.options,config:defaultConfig()});
 assert.notEqual(one.launchFile,two.launchFile);assert.equal(readLaunch(one.launchFile).transcriptPath,path.join(a.root,'a.jsonl'));assert.equal(readLaunch(two.launchFile).transcriptPath,path.join(b.root,'b.jsonl'));
});
test('switching thread updates only the exact owner display and never creates a second pane',async t=>{
 assert.equal(typeof api.bindHostSession,'function','owner-specific data binding is missing');
 const f=fixture(t),record=f.record();let one=await api.bindHostSession(record,'first-thread',path.join(f.root,'first.jsonl'),{...f.options,config:defaultConfig()});
 const next=await api.bindHostSession(api.readHost(record.file),'second-thread',path.join(f.root,'second.jsonl'),{...f.options,config:defaultConfig()});
 assert.equal(next.launchFile,one.launchFile);assert.equal(readLaunch(one.launchFile).sessionId,'second-thread');assert.equal(f.state.splits,1);
});
test('a lost split response stays uncertain and cannot create a duplicate on retry',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','display intents are missing');
 const f=fixture(t),record=f.record();f.state.uncertain=true;
 await assert.rejects(()=>api.ensureHostDisplay(record,defaultConfig(),f.options),/lost|uncertain/i);
 const saved=api.readHost(record.file);assert.equal(readLaunch(saved.launchFile).host.phase,'uncertain');
 await assert.rejects(()=>api.ensureHostDisplay(saved,defaultConfig(),f.options),/uncertain|pending/i);assert.equal(f.state.splits,1);
});
test('concurrent opens of one physical slot publish exactly one HUD',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','slot deduplication is missing');
 const f=fixture(t),record=f.record();const results=await Promise.all([api.ensureHostDisplay(record,defaultConfig(),f.options),api.ensureHostDisplay(record,defaultConfig(),f.options)]);
 assert.equal(f.state.splits,1);assert.deepEqual(new Set(results.map(r=>r.status)),new Set(['opened','already-open']));
});
test('a closed HUD is recreated only after its exact process has exited',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','display reopening is missing');
 const f=fixture(t),record=f.record(),first=await api.ensureHostDisplay(record,defaultConfig(),f.options);
 updateLaunch(first.launchFile,d=>{d.state='exited';});
 assert.equal((await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options)).status,'stopping');assert.equal(f.state.splits,1);
 f.state.viewers=[];const next=await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options);assert.equal(next.status,'opened');assert.notEqual(next.launchFile,first.launchFile);
});
test('closing one host requests only its owned HUD to stop',async t=>{
 assert.equal(typeof api.closeHost,'function','owner lifetime propagation is missing');
 const a=fixture(t),b=fixture(t,'11112233-4455-4677-8899-aabbccddeeff'),ar=a.record(),br=b.record();
 const first=await api.ensureHostDisplay(ar,defaultConfig(),a.options),second=await api.ensureHostDisplay(br,defaultConfig(),b.options);
 api.closeHost(api.readHost(ar.file),17);assert.equal(api.readHost(ar.file).exitCode,17);assert.equal(readLaunch(first.launchFile).hudStop,true);assert.equal(readLaunch(second.launchFile).hudStop,undefined);
});
