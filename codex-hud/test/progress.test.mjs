import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SessionReader} from '../dist/reader.js';import {displayWidth} from '../dist/terminal-text.js';
import {render} from '../dist/render.js';import {defaultConfig,set,get,definitions} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';import {nextDisplayAt} from '../dist/display-deadline.js';import {optionHelp} from '../dist/menu-help.js';
const row=(type,payload,at=1000)=>JSON.stringify({type,payload,timestamp:new Date(at).toISOString()})+'\n';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-public-progress-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 const file=path.join(root,'progress.jsonl');fs.writeFileSync(file,row('session_meta',{id:'progress-thread',cwd:root})+row('event_msg',{type:'task_started'}));
 return {root,file,reader:new SessionReader(file,'progress-thread'),append:(type,payload,at)=>fs.appendFileSync(file,row(type,payload,at))};
}
for(const [source,type,payload] of [
 ['legacy event','event_msg',{type:'agent_message',phase:'commentary',message:'正在核对\n\t会话绑定'}],
 ['assistant response','response_item',{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'正在核对\n\t会话绑定'}]}],
 ['canonical item','event_msg',{type:'item_completed',item:{type:'AgentMessage',phase:'commentary',content:[{type:'Text',text:'正在核对\n\t会话绑定'}]}}],
])test('public progress reads and normalizes explicit commentary from '+source,async t=>{
 const f=fixture(t);f.append(type,payload);assert.equal((await f.reader.read()).progress?.message,'正在核对 会话绑定');
});
test('progress excludes reasoning, user/final/partial messages, other threads and unclassified text',async t=>{
 const f=fixture(t);f.append('event_msg',{type:'agent_message',phase:'commentary',message:'Public progress'});
 for(const payload of [{type:'agent_reasoning',text:'PRIVATE REASONING'},{type:'agent_reasoning_raw_content',text:'PRIVATE RAW'},{type:'agent_message',phase:'final_answer',message:'PRIVATE FINAL'},{type:'agent_message',phase:'partial_answer',message:'PRIVATE PARTIAL'},{type:'agent_message',message:'PRIVATE UNCLASSIFIED'},{type:'agent_message',thread_id:'other-thread',phase:'commentary',message:'PRIVATE FOREIGN'}])f.append('event_msg',payload);
 for(const payload of [{type:'reasoning',summary:[{type:'summary_text',text:'PRIVATE REASONING'}]},{type:'message',role:'user',phase:'commentary',content:[{type:'input_text',text:'PRIVATE USER'}]},{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'PRIVATE FINAL'}]},{type:'message',role:'assistant',channel:'analysis',phase:'commentary',content:[{type:'output_text',text:'PRIVATE ANALYSIS'}]}])f.append('response_item',payload);
 const snapshot=await f.reader.read();assert.equal(snapshot.progress?.message,'Public progress');assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE/);
});
test('only the latest bounded public excerpt is retained and terminal controls are removed',async t=>{
 const f=fixture(t);f.append('event_msg',{type:'agent_message',phase:'commentary',message:'Old progress'});f.append('event_msg',{type:'agent_message',phase:'commentary',message:'\x1b[31m'+('检查😀 '.repeat(2000))+'\x1b[0m'});
 const message=(await f.reader.read()).progress?.message;assert.ok(message?.startsWith('检查😀 '));assert.ok(displayWidth(message)<=200);assert.doesNotMatch(message,/Old progress|[\x00-\x1f\x7f]/);
});
test('progress captures only a plan refreshed during the active turn',async t=>{
 const f=fixture(t);f.append('response_item',{type:'function_call',call_id:'plan-1',name:'update_plan',arguments:JSON.stringify({plan:[{step:'Verify binding',status:'in_progress'}]})});assert.equal((await f.reader.read()).progress?.step,'Verify binding');
 f.append('event_msg',{type:'task_started'},2000);let snapshot=await f.reader.read();assert.equal(snapshot.progress,undefined);assert.equal(snapshot.todos[0].step,'Verify binding');
 f.append('response_item',{type:'function_call',call_id:'plan-2',name:'update_plan',arguments:JSON.stringify({plan:[{step:'Verify binding',status:'completed'}]})},2100);snapshot=await f.reader.read();assert.equal(snapshot.progress?.step,undefined);
});
test('turn start, completion, interruption and compaction clear public progress',async t=>{
 for(const type of ['task_started','task_complete','turn_aborted','context_compacted','compact_boundary']){
  const f=fixture(t);f.append('event_msg',{type:'agent_message',phase:'commentary',message:'Old progress'});assert.equal((await f.reader.read()).progress?.message,'Old progress');f.append('event_msg',{type},2000);assert.equal((await f.reader.read()).progress,undefined,type);
  if(type==='task_complete'||type==='turn_aborted'){f.append('event_msg',{type:'agent_message',phase:'commentary',message:'Late progress'},2100);assert.equal((await f.reader.read()).progress,undefined);}
 }
});
test('log replacement clears progress before replaying a new turn',async t=>{
 const f=fixture(t);f.append('event_msg',{type:'agent_message',phase:'commentary',message:'Old progress'});assert.equal((await f.reader.read()).progress?.message,'Old progress');
 fs.writeFileSync(f.file,row('session_meta',{id:'progress-thread'})+row('event_msg',{type:'task_started'},2000));assert.equal((await f.reader.read()).progress,undefined);
});
function working(){return {...emptySnapshot('progress-thread'),status:'working',turnStartedAt:1000,progress:{message:'Checking main binding',step:'Run regressions'},tools:[{id:'read',name:'exec_command',status:'running',startedAt:2000,action:{kind:'read',target:'PRIVATE PATH'}}]};}
const visible=(s,c=defaultConfig(),options={})=>render(s,set(c,'display.showContextBar',false),{width:120,height:30,color:false,now:13000,...options}).lines;
test('progress is enabled by default with a configurable color and translated menu help',()=>{
 const c=defaultConfig();assert.equal(get(c,'display.showProgress'),true);assert.equal(get(c,'colors.progress'),'#89e3bd');
 const definition=definitions.find(d=>d.key==='display.showProgress');assert.ok(definition);assert.match(optionHelp(definition,'zh-Hans').effect,/公开|公开进度/);assert.match(optionHelp(definition,'zh-Hant').label,/進度/);
});
test('progress prefers commentary, then a fresh plan step, then safe current tool activity',()=>{
 const s=working();assert.match(visible(s)[0],/Progress: Checking main binding · 12s/);
 delete s.progress.message;assert.match(visible(s)[0],/Progress: Run regressions/);
 delete s.progress;let line=visible(s)[0];assert.match(line,/Progress:.*Read/);assert.doesNotMatch(line,/PRIVATE PATH|exec_command/);assert.equal((line.match(/\d+s/g)??[]).length,1,'progress has one elapsed-turn clock');
 s.tools=[];s.todos=[{step:'Old turn plan',status:'in_progress'}];line=visible(s)[0];assert.match(line,/Progress: Working/);assert.doesNotMatch(line,/Old turn plan/);
});
test('new turns exclude prior tools and terminal lifecycle states replace old progress',()=>{
 const s=working();delete s.progress;s.tools[0].startedAt=500;assert.match(visible(s)[0],/Progress: Working/);
 s.progress={message:'STALE progress',step:'STALE plan'};for(const [status,label]of [['idle','Idle'],['interrupted','Interrupted']]){s.status=status;const line=visible(s)[0];assert.match(line,new RegExp('Progress: '+label));assert.doesNotMatch(line,/STALE|12s|Read/);}
 s.status='unknown';assert.ok(!visible(s).some(line=>line.includes('Progress:')));
});
test('progress remains one safe terminal row for Chinese, emoji and narrow viewports',()=>{
 const s=working();s.progress.message='\x1b[31m检查😀 '.repeat(100);const c=set(defaultConfig(),'terminal.margin',0);
 for(const width of [1,4,12,24,44,100]){const lines=visible(s,c,{width});assert.equal(lines.length,1);assert.ok(displayWidth(lines[0])<=width);assert.doesNotMatch(lines[0],/\x1b/);}
});
test('progress labels support all three languages and the toggle hides the row',()=>{
 const s=working();s.progress=undefined;s.tools=[];
 for(const [language,expected]of [['en','Progress: Working'],['zh-Hans','进度: 处理中'],['zh-Hant','進度: 處理中']])assert.ok(visible(s,set(defaultConfig(),'language',language))[0].includes(expected));
 const c={...defaultConfig(),display:{...defaultConfig().display,showProgress:false}};assert.ok(!visible(s,c).some(line=>line.includes('Progress:')));
});
test('old element order arrays put progress before tools while an explicit order is respected',()=>{
 const s=working(),c=set(set(defaultConfig(),'display.showTools',true),'elementOrder',['tools','todos']);let lines=visible(s,c);assert.match(lines[0],/Progress:/);assert.match(lines[1],/Current:/);
 lines=visible(s,set(c,'elementOrder',['tools','progress']));assert.match(lines[0],/Current:/);assert.match(lines[1],/Progress:/);
});
test('only a visible working progress row with a valid elapsed time schedules clock updates',()=>{
 const s={...emptySnapshot('clock'),status:'working',turnStartedAt:0},c=defaultConfig();assert.equal(nextDisplayAt(s,c,1000),2000);
 const hidden={...c,display:{...c.display,showProgress:false}};assert.equal(nextDisplayAt(s,hidden,1000),Infinity);
 s.status='idle';assert.equal(nextDisplayAt(s,c,1000),Infinity);s.status='working';s.turnStartedAt=NaN;assert.equal(nextDisplayAt(s,c,1000),Infinity);
});
