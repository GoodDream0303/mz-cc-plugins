import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import promises from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {SessionReader} from '../dist/reader.js';import {AgentSessionTracker} from '../dist/agent-sessions.js';
const row=(type,payload,time='2026-11-16T00:00:00Z')=>JSON.stringify({type,payload,timestamp:time})+'\n';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-discovery-hints-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const parent=path.join(root,'parent.jsonl'),child=path.join(root,'arbitrary-name.jsonl'),noise=path.join(root,'noise.jsonl');
 fs.writeFileSync(parent,row('session_meta',{id:'parent-one'})+row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child-one',agent_path:'/root/review',kind:'started'}}));
 fs.writeFileSync(noise,row('session_meta',{id:'unrelated'}));for(let i=0;i<16;i++)fs.writeFileSync(path.join(root,'unrelated-'+i+'.jsonl'),row('session_meta',{id:'unrelated-'+i}));
 const clock={now:Date.now()};t.mock.method(Date,'now',()=>clock.now);
 const body=(parentId='parent-one',model='child-model')=>row('session_meta',{id:'child-one',source:{subagent:{thread_spawn:{parent_thread_id:parentId}}}})+row('turn_context',{model})+row('event_msg',{type:'task_complete'},'2026-11-16T00:00:01Z');
 const opens=[],open=promises.open;t.mock.method(promises,'open',async(...args)=>{opens.push(String(args[0]));return open(...args);});
 const reader=new SessionReader(parent,'parent-one'),tracker=new AgentSessionTracker(root);
 return {root,parent,child,noise,clock,body,opens,reader,tracker};
}
const snapshot=base=>structuredClone(base);
const fillerReads=f=>f.opens.filter(file=>path.basename(file).startsWith('unrelated-')).length;

test('unrelated directory hints read only their heads between full fallback scans',async t=>{
 const f=fixture(t),base=await f.reader.read();await f.tracker.refresh(snapshot(base),f.reader);f.opens.length=0;
 for(let i=0;i<10;i++)await f.tracker.refresh(snapshot(base),f.reader,{discover:true,files:[f.noise]});
 assert.equal(fillerReads(f),0);assert.equal(f.opens.length,10);assert.ok(f.opens.every(file=>file===f.noise));assert.equal(f.tracker.needsDiscovery,true);
});

test('matching hints discover an early nonstandard filename only after fresh full uniqueness confirmation',async t=>{
 const f=fixture(t),base=await f.reader.read();await f.tracker.refresh(snapshot(base),f.reader);fs.writeFileSync(f.child,f.body());f.opens.length=0;
 const s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].status,'done');assert.equal(s.agents[0].model,'child-model');assert.ok(fillerReads(f)>=16,'a matching hint bypassed the existing full-scan uniqueness check');
 f.opens.length=0;fs.appendFileSync(f.child,row('turn_context',{model:'new-model'})+row('event_msg',{type:'task_complete'},'2026-11-16T00:00:02Z'));
 const later=snapshot(base);await f.tracker.refresh(later,f.reader,{invalidate:true});assert.equal(later.agents[0].model,'new-model');assert.equal(fillerReads(f),0);
});

test('wrong-parent and partial hints cannot bind or provoke unrelated full scans, and complete metadata retries promptly',async t=>{
 const f=fixture(t),base=await f.reader.read();await f.tracker.refresh(snapshot(base),f.reader);f.opens.length=0;
 fs.writeFileSync(f.child,f.body('another-parent','WRONG MODEL'));let s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].model,undefined);assert.equal(fillerReads(f),0);
 fs.writeFileSync(f.child,'{"type":"session_meta","payload":{"id":"child-one');s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].model,undefined);assert.equal(fillerReads(f),0);
 fs.writeFileSync(f.child,f.body());s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].model,'child-model');
});

test('a hinted matching file cannot hide an unhinted duplicate, and ambiguous hints remain rate limited',async t=>{
 const f=fixture(t),base=await f.reader.read();await f.tracker.refresh(snapshot(base),f.reader);fs.writeFileSync(f.child,f.body());const duplicate=path.join(f.root,'duplicate.jsonl');fs.copyFileSync(f.child,duplicate);
 let s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].model,undefined);assert.equal(f.tracker.needsDiscovery,true);f.opens.length=0;
 for(let i=0;i<10;i++)await f.tracker.refresh(snapshot(base),f.reader,{discover:true,files:[f.child]});assert.equal(fillerReads(f),0,'ambiguous metadata restarted full discovery for every append');
 fs.unlinkSync(duplicate);f.clock.now+=5001;s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:false});assert.equal(s.agents[0].model,'child-model');
});

test('missed or nameless hints retain the five-second full discovery fallback',async t=>{
 const f=fixture(t),base=await f.reader.read();await f.tracker.refresh(snapshot(base),f.reader);fs.writeFileSync(f.child,f.body());f.opens.length=0;f.clock.now+=4999;
 let s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[]});assert.equal(s.agents[0].model,undefined);assert.equal(fillerReads(f),0);
 f.clock.now+=2;s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:false});assert.equal(s.agents[0].model,'child-model');
});

test('discarded parent entries do not leave an ambiguous retry gate on a newly retained entry',async t=>{
 const f=fixture(t),base=await f.reader.read();fs.writeFileSync(f.child,f.body());const duplicate=path.join(f.root,'duplicate.jsonl');fs.copyFileSync(f.child,duplicate);
 await f.tracker.refresh(snapshot(base),f.reader);fs.unlinkSync(duplicate);await f.tracker.refresh({...snapshot(base),agents:[]},f.reader);
 const s=snapshot(base);await f.tracker.refresh(s,f.reader,{discover:true,files:[f.child]});assert.equal(s.agents[0].model,'child-model');
});
