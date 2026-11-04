import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SessionReader} from '../dist/reader.js';
const api=await import('../dist/agent-sessions.js').catch(()=>({}));
const row=(type,payload,time='2026-11-04T08:00:00Z')=>JSON.stringify({type,payload,timestamp:time})+'\n';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-agent-sessions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const parent=path.join(root,'parent.jsonl'),child=path.join(root,'child.jsonl');
 fs.writeFileSync(parent,row('session_meta',{id:'parent-one'})+row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child-one',agent_path:'/root/review',kind:'started'}}));
 const meta=(parentId='parent-one')=>row('session_meta',{id:'child-one',source:{subagent:{thread_spawn:{parent_thread_id:parentId}}}});
 fs.writeFileSync(child,meta()+row('turn_context',{model:'child-model'})+row('event_msg',{type:'task_started'},'2026-11-04T08:00:01Z')+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:02Z'));
 assert.equal(typeof api.AgentSessionTracker,'function','bound child lifecycle reader is missing');
 return {root,parent,child,meta,reader:new SessionReader(parent,'parent-one'),tracker:new api.AgentSessionTracker(root)};
}
test('verified child completion fills a missing parent activity event without retaining message text',async t=>{
 const f=fixture(t);fs.appendFileSync(f.child,row('response_item',{type:'message',role:'assistant',content:[{text:'SECRET BODY'}]}));
 const s=await f.reader.read();assert.equal(s.agents[0].status,'running');await f.tracker.refresh(s,f.reader);
 assert.deepEqual(s.agents,[{id:'child-one',name:'review',status:'done',model:'child-model'}]);assert.ok(!JSON.stringify(s).includes('SECRET'));
});
test('another parent or ambiguous matching child logs cannot finish this agent',async t=>{
 const f=fixture(t);fs.writeFileSync(f.child,f.meta('other-parent')+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:02Z'));
 let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'running');
 fs.writeFileSync(f.child,f.meta()+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:02Z'));fs.copyFileSync(f.child,path.join(f.root,'duplicate.jsonl'));
 s=await f.reader.read();await new api.AgentSessionTracker(f.root).refresh(s,f.reader);assert.equal(s.agents[0].status,'running');
});
test('old child completion cannot undo a later parent resume and later child completion is read incrementally',async t=>{
 const f=fixture(t);fs.appendFileSync(f.parent,row('response_item',{type:'function_call',call_id:'resume',name:'collaboration.followup_task',arguments:JSON.stringify({target:'child-one'})},'2026-11-04T08:00:05Z')+row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'resume',agent_thread_id:'child-one',agent_path:'/root/review',kind:'interacted'}},'2026-11-04T08:00:05Z'));
 let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'running');
 fs.appendFileSync(f.child,row('event_msg',{type:'task_started'},'2026-11-04T08:00:06Z')+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:07Z'));
 s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');assert.equal(s.agents[0].model,'child-model');
});
test('a child interruption is reported but a known parent close stays closed',async t=>{
 const f=fixture(t);fs.appendFileSync(f.child,row('event_msg',{type:'turn_aborted'},'2026-11-04T08:00:03Z'));
 let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'interrupted');
 fs.appendFileSync(f.parent,row('event_msg',{type:'collab_close_end',sender_thread_id:'parent-one',receiver_thread_id:'child-one',status:'running'},'2026-11-04T08:00:04Z'));
 s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'closed');
});
test('a cached child reader revalidates its parent relationship after log replacement',async t=>{
 const f=fixture(t);let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
 fs.writeFileSync(f.child,f.meta('other-parent')+row('turn_context',{model:'WRONG MODEL'})+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:09Z'));
 s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'running');assert.equal(s.agents[0].model,undefined);
});
test('a missing child log keeps the last parent-reported state rather than inventing completion',async t=>{
 const f=fixture(t);fs.unlinkSync(f.child);const s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'running');
});
test('sending a message to an idle child does not invent a new running turn',async t=>{
 const f=fixture(t);let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
 fs.appendFileSync(f.parent,row('response_item',{type:'function_call',call_id:'message',name:'collaboration.send_message',arguments:JSON.stringify({target:'child-one',message:'SECRET'})},'2026-11-04T08:00:03Z')+row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'message',agent_thread_id:'child-one',agent_path:'/root/review',kind:'interacted'}},'2026-11-04T08:00:04Z')+row('response_item',{type:'function_call_output',call_id:'message',output:'{}'},'2026-11-04T08:00:04Z'));
 s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
});
test('an interaction without a correlated task-start call cannot invalidate a real child completion',async t=>{
 const f=fixture(t);fs.appendFileSync(f.parent,row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'unknown-message',agent_thread_id:'child-one',agent_path:'/root/review',kind:'interacted'}},'2026-11-04T08:00:04Z'));
 const s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
});
test('a known followup without canonical notification waits for the new child turn, not its old completion',async t=>{
 const f=fixture(t);fs.appendFileSync(f.parent,row('response_item',{type:'function_call',call_id:'followup',name:'collaboration.followup_task',arguments:JSON.stringify({target:'child-one',message:'SECRET'})},'2026-11-04T08:00:05Z')+row('response_item',{type:'function_call_output',call_id:'followup',output:'{}'},'2026-11-04T08:00:06Z'));
 let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'starting');
 fs.appendFileSync(f.child,row('event_msg',{type:'task_started'},'2026-11-04T08:00:07Z')+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:08Z'));
 s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
});
test('fast child completion before followup acknowledgement is newer than the actual request',async t=>{
 const f=fixture(t);fs.appendFileSync(f.parent,row('response_item',{type:'function_call',call_id:'followup',name:'collaboration.followup_task',arguments:JSON.stringify({target:'child-one'})},'2026-11-04T08:00:05Z')+row('response_item',{type:'function_call_output',call_id:'followup',output:'{}'},'2026-11-04T08:00:06Z'));
 fs.appendFileSync(f.child,row('event_msg',{type:'task_started'},'2026-11-04T08:00:05.050Z')+row('event_msg',{type:'task_complete'},'2026-11-04T08:00:05.100Z'));
 const s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
});
test('unavailable child discovery reports a metadata warning without terminating the HUD reader',async t=>{
 const f=fixture(t),s=await f.reader.read();await assert.doesNotReject(()=>new api.AgentSessionTracker(f.parent).refresh(s,f.reader));
 assert.equal(s.agents[0].status,'running');assert.ok(s.errors.some(e=>e.includes('Agent lifecycle lookup unavailable')));
});
test('replaying the same message notification cannot advance the lifecycle start threshold',async t=>{
 const f=fixture(t),interaction=row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'message',agent_thread_id:'child-one',agent_path:'/root/review',kind:'interacted'}},'2026-11-04T08:00:04Z');
 fs.appendFileSync(f.parent,row('response_item',{type:'function_call',call_id:'message',name:'collaboration.send_message',arguments:JSON.stringify({target:'child-one'})},'2026-11-04T08:00:03Z')+interaction);
 let s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
 fs.appendFileSync(f.parent,interaction);s=await f.reader.read();await f.tracker.refresh(s,f.reader);assert.equal(s.agents[0].status,'done');
});
