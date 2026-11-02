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
