import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SessionReader} from '../dist/reader.js';import {listSessions,findSession} from '../dist/sessions.js';
const record=(type,payload)=>JSON.stringify({type,payload,timestamp:'2026-11-02T08:00:00Z'})+'\n';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hud-reader-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,file:path.join(dir,'rollout-abc.jsonl')};}
test('reader uses latest context, absolute totals and the actual weekly-only quota window',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc',cwd:'C:/项目',cli_version:'0.166.0'})+record('turn_context',{model:'model-a',effort:'high',cwd:'C:/项目'})+record('event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:25,cached_input_tokens:20,output_tokens:5,total_tokens:30},total_token_usage:{input_tokens:100,cached_input_tokens:80,output_tokens:20,total_tokens:120},model_context_window:200},rate_limits:{primary:{used_percent:15,window_minutes:10080,resets_at:2000000000},secondary:null}}));
 const reader=new SessionReader(file,'abc');const s=await reader.read();assert.equal(s.model,'model-a');assert.equal(s.effort,'high');assert.equal(s.context.used,30);assert.equal(s.context.window,200);assert.equal(s.totals.total,120);assert.equal(s.totals.cached,80);assert.equal(s.quotas.length,1);assert.equal(s.quotas[0].minutes,10080);assert.equal(s.quotas[0].usedPercent,15);
 fs.appendFileSync(file,record('token_usage_record',{thread_token_usage:{input_tokens:900,output_tokens:90,total_tokens:990}}));assert.equal((await reader.read()).totals.total,120);
});
test('reader tolerates partial records and malformed lines, then resets on truncation',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc',cwd:'C:/甲'})+'not-json\n'+record('turn_context',{model:'第一模型'}).slice(0,-2));const r=new SessionReader(file,'abc');assert.equal((await r.read()).model,undefined);
 fs.appendFileSync(file,'}\n');assert.equal((await r.read()).model,'第一模型');
 fs.writeFileSync(file,record('session_meta',{id:'abc',cwd:'C:/乙'}));assert.equal((await r.read()).model,undefined);
});
test('reader rejects a replaced file belonging to another session',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('turn_context',{model:'ours'}));const r=new SessionReader(file,'abc');await r.read();fs.renameSync(file,file+'.old');fs.writeFileSync(file,record('session_meta',{id:'other'})+record('turn_context',{model:'wrong'}));const s=await r.read();assert.equal(s.model,undefined);assert.ok(s.errors.some(x=>x.includes('session')));
});
test('reader pairs tools by call ID, extracts structured plans and never retains conversation text',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('response_item',{type:'message',content:[{text:'SECRET BODY'}]})+record('response_item',{type:'function_call',call_id:'one',name:'update_plan',arguments:JSON.stringify({plan:[{step:'验证驱动',status:'in_progress'},{step:'测试',status:'pending'}]})})+record('response_item',{type:'function_call_output',call_id:'one',output:'ok'})+record('response_item',{type:'function_call',call_id:'two',name:'mcp__server__search',arguments:'SECRET ARGUMENTS'}));
 const s=await new SessionReader(file,'abc').read();assert.equal(s.todos.length,2);assert.equal(s.todos[0].status,'in_progress');assert.equal(s.tools.find(x=>x.id==='one').status,'done');assert.equal(s.tools.find(x=>x.id==='two').status,'running');assert.deepEqual(s.mcpUsed,['server']);assert.ok(!JSON.stringify(s).includes('SECRET'));
});
test('session discovery reads metadata and requires exact or unique session IDs',async t=>{
 const {dir,file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc-one',cwd:'C:/相同'}));fs.writeFileSync(path.join(dir,'rollout-b.jsonl'),record('session_meta',{id:'abc-two',cwd:'C:/相同'}));const list=await listSessions(dir);assert.equal(list.length,2);assert.equal((await findSession(dir,'abc-one')).id,'abc-one');await assert.rejects(()=>findSession(dir,'abc'),/ambiguous/i);
});
test('reader preserves a supplied session title and recognizes nonzero tool exit codes',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc',title:'列出 Codex 常用插件'})+record('response_item',{type:'function_call',call_id:'bad',name:'exec_command',arguments:'{}'})+record('response_item',{type:'function_call_output',call_id:'bad',output:JSON.stringify({exit_code:2,output:'not retained'})}));const s=await new SessionReader(file,'abc').read();assert.equal(s.sessionName,'列出 Codex 常用插件');assert.equal(s.tools[0].status,'failed');
});
test('reader handles canonical MCP and command events, deduplicates calls and retains no payload text',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('response_item',{type:'function_call',call_id:'mcp-one',name:'mcp__docs__search',arguments:'SECRET ARGS'})+record('event_msg',{type:'item_completed',item:{type:'McpToolCall',id:'mcp-one',server:'docs',tool:'search',status:'completed',arguments:{query:'SECRET QUERY'},result:{content:'SECRET RESULT'}}})+record('event_msg',{type:'item_completed',item:{type:'CommandExecution',id:'cmd-one',command:['SECRET COMMAND'],status:'completed',aggregated_output:'SECRET OUTPUT',exit_code:2}})+record('event_msg',{type:'item_completed',item:{type:'McpToolCall',id:'mcp-two',server:'other',tool:'check',status:'failed',error:{message:'SECRET ERROR'}}}));
 const s=await new SessionReader(file,'abc').read();assert.deepEqual(s.mcpUsed,['docs','other']);assert.equal(s.tools.filter(t=>t.id==='mcp-one').length,1);assert.equal(s.tools.find(t=>t.id==='mcp-one').status,'done');assert.equal(s.tools.find(t=>t.id==='cmd-one').status,'failed');assert.equal(s.tools.find(t=>t.id==='mcp-two').status,'failed');assert.ok(!JSON.stringify(s).includes('SECRET'));
});
test('canonical completion stays authoritative when duplicate response records arrive later',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('event_msg',{type:'item_started',item:{type:'McpToolCall',id:'one',server:'docs',tool:'search',status:'in_progress'}}));const reader=new SessionReader(file,'abc');assert.equal((await reader.read()).tools[0]?.status,'running');
 fs.appendFileSync(file,record('event_msg',{type:'item_completed',item:{type:'McpToolCall',id:'one',server:'docs',tool:'search',status:'failed',error:{message:'not retained'}}})+record('response_item',{type:'function_call',call_id:'one',name:'mcp__docs__search',arguments:'{}'})+record('response_item',{type:'function_call_output',call_id:'one',output:'{}'}));const s=await reader.read();assert.equal(s.tools.length,1);assert.equal(s.tools[0].status,'failed');assert.deepEqual(s.mcpUsed,['docs']);
});
test('reader rechecks session identity after an in-place rewrite grows past the old offset',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('turn_context',{model:'ours'}));const reader=new SessionReader(file,'abc');await reader.read();
 fs.writeFileSync(file,record('session_meta',{id:'other',padding:'x'.repeat(500)})+record('turn_context',{model:'WRONG'}));const s=await reader.read();assert.equal(s.model,undefined);assert.ok(s.errors.some(e=>e.includes('session identity mismatch')));
});
test('same-session in-place rewrite rebuilds telemetry instead of retaining old activity',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('turn_context',{model:'old'})+record('response_item',{type:'function_call',call_id:'old-call',name:'old_tool'}));const reader=new SessionReader(file,'abc');await reader.read();
 fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('response_item',{type:'message',content:[{text:'x'.repeat(2000)}]})+record('turn_context',{model:'new'}));const s=await reader.read();assert.equal(s.model,'new');assert.deepEqual(s.tools,[]);
});

test('spawn result correlates the call with its real agent and wait completion retains no response body',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn-1',name:'collaboration.spawn_agent',arguments:JSON.stringify({task_name:'审查驱动',message:'SECRET PROMPT'})}));
 const reader=new SessionReader(file,'parent');assert.equal((await reader.read()).agents[0].status,'starting');
 fs.appendFileSync(file,record('response_item',{type:'function_call_output',call_id:'spawn-1',output:JSON.stringify({agent_id:'child-1',status:'running'})}));
 assert.deepEqual((await reader.read()).agents,[{id:'child-1',name:'审查驱动',status:'running'}]);
 fs.appendFileSync(file,record('response_item',{type:'function_call',call_id:'wait-1',name:'wait',arguments:JSON.stringify({ids:['child-1']})})+record('response_item',{type:'function_call_output',call_id:'wait-1',output:JSON.stringify({status:{'child-1':{completed:'SECRET FINAL'}},timed_out:false})}));
 const s=await reader.read();assert.deepEqual(s.agents,[{id:'child-1',name:'审查驱动',status:'done'}]);assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('canonical spawn and completion stay authoritative over duplicate spawn tool results',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn-1',name:'spawn_agent',arguments:JSON.stringify({task_name:'Check firmware'})})+record('event_msg',{type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'spawn-1',new_thread_id:'child-1',new_agent_nickname:'Ada',status:'running',prompt:'SECRET PROMPT'})+record('event_msg',{type:'collab_waiting_end',sender_thread_id:'parent',call_id:'wait-1',statuses:{'child-1':{completed:'SECRET RESULT'}},agent_statuses:[{thread_id:'child-1',agent_nickname:'Ada',status:{completed:'SECRET RESULT'}}]})+record('response_item',{type:'function_call_output',call_id:'spawn-1',output:JSON.stringify({agent_id:'child-1',status:'running'})}));
 const s=await new SessionReader(file,'parent').read();assert.deepEqual(s.agents,[{id:'child-1',name:'Check firmware',status:'done'}]);assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('v2 task paths correlate with activity IDs without retaining a ghost call identity',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn-2',name:'collaboration.spawn_agent',arguments:JSON.stringify({task_name:'review'})})+record('response_item',{type:'function_call_output',call_id:'spawn-2',output:JSON.stringify({task_name:'/root/review'})})+record('event_msg',{type:'sub_agent_activity',event_id:'start',agent_thread_id:'child-2',agent_path:'/root/review',kind:'started'})+record('event_msg',{type:'sub_agent_activity',event_id:'done',agent_thread_id:'child-2',agent_path:'/root/review',kind:'completed'}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child-2',name:'review',status:'done'}]);
});

test('agent close records closed rather than its previous status and resume uses reported status',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',{type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'spawn',new_thread_id:'child',new_agent_nickname:'reviewer',status:'running'})+record('event_msg',{type:'collab_close_end',sender_thread_id:'parent',receiver_thread_id:'child',status:'running'}));
 const reader=new SessionReader(file,'parent');assert.equal((await reader.read()).agents[0].status,'closed');
 fs.appendFileSync(file,record('event_msg',{type:'collab_resume_end',sender_thread_id:'parent',receiver_thread_id:'child',status:'pending_init'}));assert.equal((await reader.read()).agents[0].status,'starting');
 fs.appendFileSync(file,record('event_msg',{type:'collab_agent_interaction_end',sender_thread_id:'parent',receiver_thread_id:'child',status:{errored:'SECRET ERROR'}}));
 const s=await reader.read();assert.equal(s.agents[0].status,'failed');assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('wait timeout does not finish an agent and unrelated sender events cannot change it',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',{type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'spawn',new_thread_id:'child',status:'running'})+record('response_item',{type:'function_call',call_id:'wait-1',name:'wait',arguments:JSON.stringify({ids:['child']})})+record('response_item',{type:'function_call_output',call_id:'wait-1',output:JSON.stringify({status:{},timed_out:true})})+record('event_msg',{type:'collab_waiting_end',sender_thread_id:'other-parent',statuses:{child:{completed:'SECRET'}}}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'agent',status:'running'}]);
});

test('failed spawns and unreported legacy statuses do not invent running agents',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'bad-spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'failing'})})+record('response_item',{type:'function_call_output',call_id:'bad-spawn',output:JSON.stringify({error:'SECRET FAILURE'})})+record('event_msg',{type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'unknown-spawn',new_thread_id:'child',status:{unrecognized:'SECRET'}}));
 const s=await new SessionReader(file,'parent').read();assert.deepEqual(s.agents.map(a=>[a.name,a.status]),[['failing','failed'],['agent','unreported']]);assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('canonical SubAgentActivity items update v2 agents without reading delivered message text',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child',agent_path:'/root/review',kind:'started'}})+record('response_item',{type:'function_call_output',call_id:'spawn',output:JSON.stringify({task_name:'/root/review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'completed-event',agent_thread_id:'child',agent_path:'/root/review',kind:'completed'}}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'review',status:'done'}]);
});

test('canonical in-progress commands remain live until a final process event arrives',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',{type:'item_completed',item:{type:'CommandExecution',id:'cmd-start',process_id:'session-42',status:'in_progress'}}));
 const reader=new SessionReader(file,'parent');assert.equal((await reader.read()).tools[0].status,'running');
 fs.appendFileSync(file,record('event_msg',{type:'item_completed',item:{type:'CommandExecution',id:'cmd-poll',process_id:'session-42',status:'completed',exit_code:0,aggregated_output:'SECRET'}}));
 const s=await reader.read();assert.equal(s.tools.length,1);assert.equal(s.tools[0].status,'done');assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('yielded command sessions update the original live tool through later polling',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'command',name:'exec_command',arguments:'{}'})+record('response_item',{type:'function_call_output',call_id:'command',output:JSON.stringify({session_id:42,output:'SECRET'})}));
 const reader=new SessionReader(file,'parent');assert.equal((await reader.read()).tools.find(x=>x.id==='command').status,'running');
 fs.appendFileSync(file,record('response_item',{type:'function_call',call_id:'poll',name:'write_stdin',arguments:JSON.stringify({session_id:42})})+record('response_item',{type:'function_call_output',call_id:'poll',output:JSON.stringify({session_id:42,output:'SECRET'})}));
 assert.equal((await reader.read()).tools.find(x=>x.id==='command').status,'running');
 fs.appendFileSync(file,record('response_item',{type:'function_call',call_id:'last-poll',name:'write_stdin',arguments:JSON.stringify({session_id:42})})+record('response_item',{type:'function_call_output',call_id:'last-poll',output:JSON.stringify({exit_code:2,output:'SECRET'})}));
 const s=await reader.read();assert.equal(s.tools.find(x=>x.id==='command').status,'failed');assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('cancellation and completed extension tools replace their live states',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',{type:'item_started',item:{type:'Extension',id:'search',kind:'web.search'}})+record('event_msg',{type:'item_started',item:{type:'CommandExecution',id:'command',status:'in_progress'}}));
 const reader=new SessionReader(file,'parent');assert.deepEqual((await reader.read()).tools.map(t=>t.status),['running','running']);
 fs.appendFileSync(file,record('event_msg',{type:'item_completed',item:{type:'Extension',id:'search',kind:'web.search'}})+record('event_msg',{type:'item_completed',item:{type:'CommandExecution',id:'command',status:'cancelled'}}));
 assert.deepEqual((await reader.read()).tools.map(t=>t.status),['done','cancelled']);
});

test('a late spawn request preserves the original task name and replayed activity does not regress completion',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',{type:'collab_agent_spawn_begin',call_id:'spawn',sender_thread_id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'审查原名'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'started',agent_thread_id:'child',agent_path:'/root/review',kind:'started'}})+record('response_item',{type:'function_call_output',call_id:'spawn',output:JSON.stringify({task_name:'/root/review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'finished',agent_thread_id:'child',agent_path:'/root/review',kind:'completed'}})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'started',agent_thread_id:'child',agent_path:'/root/review',kind:'started'}}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'审查原名',status:'done'}]);
});

test('recent-history eviction retains a still-running tool until its result arrives',async t=>{
 const {file}=fixture(t);let content=record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'long',name:'long_build',arguments:'{}'});
 for(let i=0;i<80;i++)content+=record('response_item',{type:'function_call',call_id:'quick-'+i,name:'quick',arguments:'{}'})+record('response_item',{type:'function_call_output',call_id:'quick-'+i,output:'{}'});
 fs.writeFileSync(file,content);const reader=new SessionReader(file,'parent');const s=await reader.read();assert.equal(s.tools.length,64);assert.equal(s.tools.find(t=>t.id==='long').status,'running');
 fs.appendFileSync(file,record('response_item',{type:'function_call_output',call_id:'long',output:'{}'}));assert.equal((await reader.read()).tools.find(t=>t.id==='long').status,'done');
});

test('canonical activity links a pending spawn immediately even when its tool result is missing',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'Original task'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child',agent_path:'/root/review',kind:'started'}}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'Original task',status:'running'}]);
});

test('replayed canonical spawn acknowledgement cannot overwrite a later agent completion',async t=>{
 const {file}=fixture(t),spawn={type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'spawn',new_thread_id:'child',status:'running'};
 fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('event_msg',spawn)+record('event_msg',{type:'collab_waiting_end',sender_thread_id:'parent',statuses:{child:{completed:'SECRET'}}})+record('event_msg',spawn));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'agent',status:'done'}]);
});

test('exec and wait correlate fixed metadata envelopes without interpreting result-body text',async t=>{
 const {file}=fixture(t),output=text=>[{type:'input_text',text}];
 fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'custom_tool_call',call_id:'exec',name:'functions.exec',input:'SECRET CODE'})+record('response_item',{type:'custom_tool_call_output',call_id:'exec',output:output('Script running with cell ID 42\nWall time: 0.1 seconds\nOutput:\nSECRET BODY')}));
 const reader=new SessionReader(file,'parent');assert.equal((await reader.read()).tools.find(t=>t.id==='exec').status,'running');
 fs.appendFileSync(file,record('response_item',{type:'function_call',call_id:'wait',name:'functions.wait',arguments:JSON.stringify({cell_id:'42'})})+record('response_item',{type:'function_call_output',call_id:'wait',output:output('Script completed\nWall time: 2 seconds\nOutput:\nProcess running with session ID 99\nSECRET BODY')}));
 const s=await reader.read();assert.equal(s.tools.find(t=>t.id==='exec').status,'done');assert.equal(s.tools.find(t=>t.id==='wait').status,'done');assert.ok(!JSON.stringify(s).includes('SECRET'));
});

test('canonical activity resolves a short interrupt target before its tool result',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'review'})})+record('response_item',{type:'function_call_output',call_id:'spawn',output:JSON.stringify({task_name:'/root/review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child',agent_path:'/root/review',kind:'started'}})+record('response_item',{type:'function_call',call_id:'interrupt',name:'interrupt_agent',arguments:JSON.stringify({target:'review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'interrupt',agent_thread_id:'child',agent_path:'/root/review',kind:'interrupted'}})+record('response_item',{type:'function_call_output',call_id:'interrupt',output:'{}'}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'review',status:'interrupted'}]);
});

test('agents show the resolved model and keep it through later lifecycle updates',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('turn_context',{model:'parent-model'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'review',model:'requested-model'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child',agent_path:'/root/review',kind:'started',model:'actual-model'}})+record('response_item',{type:'function_call_output',call_id:'spawn',output:JSON.stringify({task_name:'/root/review',model:'requested-model'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'done',agent_thread_id:'child',agent_path:'/root/review',kind:'completed',model:null}})+record('event_msg',{type:'collab_agent_spawn_end',sender_thread_id:'parent',call_id:'legacy',new_thread_id:'legacy-child',new_agent_nickname:'legacy',model:'resolved-legacy-model',status:'running'})+record('response_item',{type:'function_call',call_id:'unreported',name:'spawn_agent',arguments:JSON.stringify({task_name:'unreported',model:'requested-only'})})+record('response_item',{type:'function_call_output',call_id:'unreported',output:JSON.stringify({agent_id:'unknown-model-child'})}));
 const s=await new SessionReader(file,'parent').read();assert.deepEqual(s.agents,[{id:'child',name:'review',status:'done',model:'actual-model'},{id:'legacy-child',name:'legacy',status:'running',model:'resolved-legacy-model'},{id:'unknown-model-child',name:'unreported',status:'running'}]);
});

test('a spawn result can fill an unreported canonical model without changing agent status',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'spawn',agent_thread_id:'child',agent_path:'/root/review',kind:'started',model:null}})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'done',agent_thread_id:'child',agent_path:'/root/review',kind:'completed'}})+record('response_item',{type:'function_call_output',call_id:'spawn',output:[{type:'input_text',text:JSON.stringify({task_name:'/root/review',model:'reported-model'})}]}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'review',status:'done',model:'reported-model'}]);
});

test('a reported canonical model is preserved even when activity and spawn call IDs differ',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,record('session_meta',{id:'parent'})+record('response_item',{type:'function_call',call_id:'spawn',name:'spawn_agent',arguments:JSON.stringify({task_name:'review'})})+record('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:'activity',agent_thread_id:'child',agent_path:'/root/review',kind:'started',model:'canonical-model'}})+record('response_item',{type:'function_call_output',call_id:'spawn',output:JSON.stringify({task_name:'/root/review',model:'fallback-model'})}));
 assert.deepEqual((await new SessionReader(file,'parent').read()).agents,[{id:'child',name:'review',status:'running',model:'canonical-model'}]);
});
