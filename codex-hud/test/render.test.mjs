import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {displayWidth,sanitize,wrapAnsi} from '../dist/terminal-text.js';import {defaultConfig,set,importClaude,preset} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
function sample(){return {...emptySnapshot('abc-session'),model:'gpt-example',effort:'high',cwd:'C:/项目/固件😀',context:{used:30,window:200},totals:{input:100,cached:80,output:20,reasoning:5,total:120},latest:{input:25,cached:20,output:5,reasoning:1,total:30},quotas:[{id:'codex:primary',minutes:10080,usedPercent:15,resetsAt:2000000000}],mcpUsed:['docs'],agents:[{id:'a',name:'分析',status:'unknown'}],todos:[{step:'验证驱动',status:'in_progress'}],tools:[{id:'t',name:'secret-tool',status:'running'}]};}

for(const [language,expected]of [
 ['en',['Run command','Run script','Follow up on task','Ask user','Wait']],
 ['zh-Hans',['执行命令','运行脚本','跟进子任务','向你提问','短暂等待']],
 ['zh-Hant',['執行命令','執行腳本','跟進子任務','向你提問','短暫等待']],
])test('known tool actions use friendly labels in '+language,()=>{
 const names=['exec_command','exec','followup_task','request_user_input_async','clock.sleep'];
 const s={...emptySnapshot('parent'),tools:names.map((name,i)=>({id:String(i),name,status:'running'}))};
 const c=set(set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),'language',language);
 const text=render(s,c,{width:240,height:30,color:false}).lines.join('\n');
 for(const name of expected)assert.ok(text.includes('◐ '+name+' ×1'),name);for(const name of names)assert.ok(!text.includes(name),name);
});
test('only recognized core namespaces receive action labels while unknown tools retain their names',()=>{
 const names=['functions.exec_command','functions.exec','collaboration.followup_task','functions.request_user_input_async','clock.sleep','mcp__example__exec','other.exec','constructor'];
 const c=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),s={...emptySnapshot('parent'),tools:names.map((name,i)=>({id:String(i),name,status:'done'}))};
 const text=render(s,c,{width:240,height:30,color:false}).lines.join('\n');
 for(const name of ['Run command','Run script','Follow up on task','Ask user','Wait','other.exec','constructor'])assert.ok(text.includes('✓ '+name+' ×1'),name);assert.ok(!text.includes('mcp__example__exec'));
});

test('MCP connections persist without active calls and active invocations are separate from ordinary tools',()=>{
 const config=set(set(set(defaultConfig(),'display.showTools',true),'display.showMcp',true),'display.showContextBar',false);
 const s={...emptySnapshot('parent'),environment:{mcp:[{name:'docs',enabled:true}],errors:[]},tools:[{id:'cmd',name:'exec_command',action:{kind:'nodeTest'},startedAt:1000,status:'running'},{id:'mcp',name:'mcp__docs__query',mcp:{server:'docs',tool:'query'},startedAt:2000,status:'running'}]};
 let text=render(s,config,{width:120,height:30,color:false,now:4400}).lines.join('\n');assert.match(text,/MCP connections:/);assert.match(text,/docs.*Unknown/);assert.match(text,/Node tests.*3\.4s/);assert.match(text,/MCP calls:.*docs \/ query.*2\.4s/);assert.doesNotMatch(text,/mcp__docs|query ×/);
 s.tools[1].status='done';s.tools[1].finishedAt=4300;text=render(s,config,{width:120,height:30,color:false,now:4400}).lines.join('\n');assert.match(text,/docs.*Unknown/);assert.doesNotMatch(text,/MCP calls:|query|Recent:/);
});

test('rich ordinary actions distinguish targets and timestamps without altering unknown legacy names',()=>{
 const config=set(set(set(defaultConfig(),'display.showTools',true),'display.showContextBar',false),'display.toolsMaxVisible',0);
 const s={...emptySnapshot('parent'),tools:[{id:'a',name:'exec_command',action:{kind:'read',target:'render.ts'},status:'running',startedAt:1000},{id:'b',name:'exec_command',action:{kind:'read',target:'reader.ts'},status:'running',startedAt:2000},{id:'c',name:'exec',status:'done'}]};
 const text=render(s,config,{width:160,height:30,color:false,now:3000}).lines.join('\n');assert.match(text,/Read file · render.ts.*2s/);assert.match(text,/Read file · reader.ts.*1s/);assert.match(text,/Run script ×1/);
});

test('nonofficial MCP connection names stay visible on every activity page alongside critical warnings',()=>{
 const config=set(set(set(set(defaultConfig(),'display.showMcp',true),'display.showTools',true),'display.showContextBar',false),'display.toolsMaxVisible',0);
 const s={...emptySnapshot('parent'),errors:['critical warning'],environment:{mcp:[{name:'docs',enabled:true}],errors:[]},tools:Array.from({length:12},(_,i)=>({id:String(i),name:'task_'+i,status:'running'}))};
 const first=render(s,config,{width:80,height:5,color:false});assert.ok(first.pages>1);
 const pages=Array.from({length:first.pages},(_,page)=>render(s,config,{width:80,height:5,color:false,page}).lines.join('\n'));
 for(const page of pages){assert.match(page,/critical warning/);assert.match(page,/docs.*Unknown/);assert.ok(page.split('\n').length<=5);}
 const text=pages.join('\n');for(let i=0;i<12;i++)assert.ok(text.includes('task_'+i),'task_'+i);
});

test('narrow short MCP layouts preserve overflow content and critical warning priority',()=>{
 const config=set(set(set(defaultConfig(),'display.showMcp',true),'display.showTools',true),'display.showContextBar',false);
 const s={...emptySnapshot('parent'),errors:['critical warning'],mcpUsed:['one','two','three'],tools:[{id:'a',name:'mcp__one__query',status:'running',startedAt:1000}]};
 for(const height of [1,2,3,4,7]){
  const first=render(s,config,{width:32,height,color:false,now:2000});const pages=Array.from({length:first.pages},(_,page)=>render(s,config,{width:32,height,color:false,now:2000,page}));
  for(const page of pages){assert.match(page.lines[0],/critical warning/);assert.ok(page.lines.length<=height);assert.ok(page.lines.every(line=>displayWidth(line)<=28));}
  if(height>1){const text=pages.flatMap(p=>p.lines).join('\n');for(const name of ['one','two','three','query'])assert.ok(text.includes(name),height+': '+name);}
 }
});

test('connection and active-call areas localize and preserve foreground-only coloring and no-color output',()=>{
 const base=set(set(set(defaultConfig(),'display.showMcp',true),'display.showTools',true),'display.showContextBar',false);
 const s={...emptySnapshot('parent'),mcpUsed:['docs'],tools:[{id:'a',name:'mcp__docs__query',status:'running',startedAt:1000}]};
 const previous=process.env.NO_COLOR;delete process.env.NO_COLOR;try{for(const [lang,connection,call]of [['en','MCP connections:','MCP calls:'],['zh-Hans','MCP连接:','MCP调用:'],['zh-Hant','MCP連線:','MCP呼叫:']]){
  const c=set(base,'language',lang),plain=render(s,c,{width:120,height:20,color:false,now:2000}).lines.join('\n');assert.ok(plain.includes(connection));assert.ok(plain.includes(call));assert.ok(!plain.includes('\u001b'));
  const colored=render(s,c,{width:120,height:20,color:true,now:2000}).lines.join('\n');assert.match(colored,/\x1b\[38;2;242;242;242m/);assert.doesNotMatch(colored,/\x1b\[(?:1|7|4[0-9]|48)[;m]/);
 }process.env.NO_COLOR='1';assert.ok(!render(s,base,{width:120,height:20,color:true,now:2000}).lines.join('\n').includes('\u001b'));}finally{if(previous===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=previous;}
});
test('friendly labels preserve raw identities, per-status counts and caller-owned metadata',()=>{
 const c=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),s={...emptySnapshot('parent'),tools:[{id:'a',name:'exec',status:'done'},{id:'b',name:'exec',status:'done'},{id:'c',name:'functions.exec',status:'done'},{id:'d',name:'exec',status:'failed'},{id:'e',name:'exec',status:'cancelled'}]},before=structuredClone(s);
 const text=render(s,c,{width:240,height:30,color:false}).lines.join('\n');
 for(const part of ['✓ Run script ×2','✓ Run script ×1','✗ Run script ×1','⊘ Run script ×1'])assert.ok(text.includes(part),part);assert.deepEqual(s,before);
});
test('tool name limits truncate the translated label by terminal cells',()=>{
 const c=set(set(defaultConfig(),'display.showTools',true),'display.toolNameMaxLength',7),s={...emptySnapshot('parent'),tools:[{id:'a',name:'exec_command',status:'running'}]};
 assert.match(render(s,c,{width:100,height:30,color:false}).lines.join('\n'),/◐ Run co… ×1/);
 const chinese=set(set(c,'language','zh-Hans'),'display.toolNameMaxLength',5);s.tools[0].name='followup_task';
 assert.match(render(s,chinese,{width:100,height:30,color:false}).lines.join('\n'),/◐ 跟进… ×1/);
});
test('agent lifecycle labels are localized and missing reports are explicit',()=>{
 const s={...emptySnapshot('parent'),agents:[{id:'a',name:'Task 原文',status:'running'},{id:'b',name:'review',status:'unknown'}]};
 const config=set(defaultConfig(),'display.showAgents',true);
 const english=render(s,config,{width:200,height:30,color:false}).lines.join('\n');assert.match(english,/Task 原文 \[running\]/);assert.match(english,/review \[status not reported\]/);
 const chinese=render(s,set(config,'language','zh-Hans'),{width:200,height:30,color:false}).lines.join('\n');assert.match(chinese,/Task 原文 \[运行中\]/);assert.match(chinese,/review \[状态未报告\]/);
});
test('running tools stay visible while later tools finish and cancelled tools are distinct',()=>{
 const config=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',2);
 const s={...emptySnapshot('parent'),tools:[{id:'long',name:'long_build',status:'running'},{id:'a',name:'old_done',status:'done'},{id:'b',name:'latest_done',status:'done'}]};
 let result=render(s,config,{width:150,height:30,color:false}).lines.join('\n');assert.match(result,/◐ long_build/);assert.match(result,/✓ latest_done/);assert.doesNotMatch(result,/old_done/);
 s.tools[0].status='cancelled';result=render(s,config,{width:150,height:30,color:false}).lines.join('\n');assert.doesNotMatch(result,/◐ long_build/);
 s.tools.push({id:'c',name:'cancelled_check',status:'cancelled'});assert.match(render(s,config,{width:150,height:30,color:false}).lines.join('\n'),/⊘ cancelled_check/);
});
test('zero visible-tool limit retains its existing unlimited behavior',()=>{
 const config=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),s={...emptySnapshot('parent'),tools:[{id:'a',name:'active',status:'running'},{id:'b',name:'finished',status:'done'}]};
 const text=render(s,config,{width:150,height:30,color:false}).lines.join('\n');assert.match(text,/◐ active/);assert.match(text,/✓ finished/);
});
test('each agent displays its actual model or an explicit missing-model label',()=>{
 const s={...emptySnapshot('parent'),agents:[{id:'a',name:'Task 原文',status:'running',model:'actual-model'},{id:'b',name:'review',status:'done'}]},config=set(defaultConfig(),'display.showAgents',true);
 const english=render(s,config,{width:200,height:30,color:false}).lines.join('\n');assert.match(english,/Task 原文 \[running\] \(actual-model\)/);assert.match(english,/review \[done\] \(model not reported\)/);
 const chinese=render(s,set(config,'language','zh-Hans'),{width:200,height:30,color:false}).lines.join('\n');assert.match(chinese,/Task 原文 \[运行中\] \(actual-model\)/);assert.match(chinese,/review \[已完成\] \(模型未报告\)/);
});
test('a temporarily suppressed pager uses the full viewport and preserves warnings',()=>{
 const config=set(set(defaultConfig(),'display.showContextBar',false),'display.customLine','x'.repeat(200));
 const s={...emptySnapshot('parent'),errors:['important warning']};
 const result=render(s,config,{width:40,height:3,color:false,showPager:false});
 assert.equal(result.lines.length,3);assert.match(result.lines[0],/important warning/);assert.doesNotMatch(result.lines.join('\n'),/page|翻页|q close/);assert.ok(result.pages>1);
 const capped=render(s,config,{width:40,height:3,color:false});assert.match(capped.lines.join('\n'),/page/);
});
test('default quota display shows both reported windows even at zero usage',()=>{
 const snapshot={...sample(),quotas:[{id:'codex:primary',minutes:10080,usedPercent:0},{id:'codex:secondary',minutes:300,usedPercent:0}]};
 const text=render(snapshot,defaultConfig(),{width:200,height:50,color:false}).lines.join('\n');
 assert.match(text,/5h:.*0%/);assert.match(text,/7d:.*0%/);
});
test('quota window switches are independent while the umbrella and thresholds still apply',()=>{
 const snapshot={...sample(),quotas:[{id:'codex:primary',minutes:10080,usedPercent:21},{id:'codex:secondary',minutes:300,usedPercent:12}]};
 const output=config=>render(snapshot,config,{width:200,height:50,color:false}).lines.join('\n');
 const fiveOff=output(set(defaultConfig(),'display.showFiveHourUsage',false));assert.doesNotMatch(fiveOff,/5h:/);assert.match(fiveOff,/7d:/);
 const sevenOff=output(set(defaultConfig(),'display.showSevenDayUsage',false));assert.match(sevenOff,/5h:/);assert.doesNotMatch(sevenOff,/7d:/);
 const allOff=output(set(defaultConfig(),'display.showUsage',false));assert.doesNotMatch(allOff,/5h:|7d:/);
 const threshold=output(importClaude({display:{usageThreshold:20,sevenDayThreshold:80}}).config);assert.doesNotMatch(threshold,/5h:|7d:/);
 const noData=set(set(defaultConfig(),'display.showFiveHourUsage',false),'display.showSevenDayUsage',false);
 assert.doesNotMatch(render(emptySnapshot('abc'),noData,{width:200,height:50,color:false}).lines.join('\n'),/Quota:/);
});
test('configured quota windows are shown only when reported, including weekly-only accounts',()=>{
 const output=(snapshot,config=defaultConfig())=>render(snapshot,config,{width:200,height:50,color:false}).lines.join('\n');
 const weekly=output(sample());assert.doesNotMatch(weekly,/5h:/);assert.match(weekly,/7d: [^|\n]*15%/);
 const missing=output(emptySnapshot('abc'));assert.doesNotMatch(missing,/5h:|7d:/);
 assert.doesNotMatch(output(sample(),set(defaultConfig(),'display.showFiveHourUsage',false)),/5h:/);
 const chinese=output(emptySnapshot('abc'),set(defaultConfig(),'language','zh-Hans'));assert.doesNotMatch(chinese,/5h:|7d:/);
 const custom=output({...emptySnapshot('abc'),quotas:[{id:'other:primary',minutes:60,usedPercent:8}]});assert.match(custom,/1h: [^|\n]*8%/);assert.doesNotMatch(custom,/5h:|7d:/);
});
test('merged telemetry keeps a quota field together without dangling separators',()=>{
 const config=set(set(defaultConfig(),'display.showSessionTokens',true),'display.sevenDayThreshold',0);
 const out=render(sample(),config,{width:74,height:30,color:false,now:1999996400000}).lines;
 const quota=out.find(line=>line.includes('7d:'));assert.match(quota,/7d:.*15%/);
 assert.ok(out.every(line=>!/^\s*\||\|\s*$/.test(line)));
});
test('empty activity groups use no rows and completed plans have clear text',()=>{
 let config=defaultConfig();for(const key of ['showMcp','showAgents','showTodos'])config=set(config,'display.'+key,true);
 const empty=render(emptySnapshot('abc-session'),config,{width:100,height:30,color:false}).lines.join('\n');
 assert.doesNotMatch(empty,/MCP:|Agents:|Todo:/);
 const snapshot=emptySnapshot('abc-session');snapshot.todos=[{step:'Finished',status:'completed'}];
 assert.match(render(snapshot,config,{width:100,height:30,color:false}).lines.join('\n'),/All tasks complete \(1\/1\)/);
});
test('stale telemetry warnings remain visible in short and single-row panes',()=>{
 const snapshot=sample();snapshot.errors=['Session log unavailable; showing stale telemetry'];
 for(const height of [1,2,3,5])for(const page of [0,1]){
  const out=render(snapshot,set(defaultConfig(),'display.showSessionTokens',true),{width:70,height,page,color:false}).lines;
  assert.match(out[0],/Session log unavailable/);assert.ok(out.length<=height);
 }
});
test('default HUD supplements the native statusline without repeating its identity fields',()=>{
 const snapshot={...sample(),sessionName:'列出 Codex 常用插件'};const text=render(snapshot,defaultConfig(),{width:120,height:50,color:false}).lines.join('\n');assert.ok(!text.includes('gpt-example'));assert.ok(!text.includes('high'));assert.ok(!text.includes('固件'));assert.ok(!text.includes('列出 Codex 常用插件'));assert.match(text,/Context/);
});
test('optional session name never falls back to displaying a session ID',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef';const text=render(emptySnapshot(id),set(defaultConfig(),'display.showSessionName',true),{width:120,height:50,color:false}).lines.join('\n');assert.ok(!text.includes('01234567'));assert.match(text,/unknown/);
});
test('renderer respects imported activity preferences and weekly-only quota labels',()=>{
 const {config}=importClaude({display:{showTools:false,showAgents:true,showTodos:true,showMcp:true,showSessionTokens:true,sevenDayThreshold:0}});const text=render(sample(),config,{width:140,height:50,color:false}).lines.join('\n');
 assert.ok(!text.includes('secret-tool'));assert.match(text,/MCP/);assert.match(text,/分析/);assert.match(text,/验证驱动/);assert.match(text,/7d/);assert.doesNotMatch(text,/5h:/);assert.match(text,/120/);assert.ok(!text.includes('200 Token'));
});
test('renderer uses latest context and cannot inflate it with cumulative counters',()=>{
 const text=render(sample(),defaultConfig(),{width:120,height:50,color:false}).lines.join('\n');assert.match(text,/15%/);assert.ok(!text.includes('60%'));
});
test('terminal wrapping keeps short quota labels together when a word can move to the next line',()=>{
 const lines=wrapAnsi('Context 1234 | 7d: 10%',16);assert.ok(lines.some(line=>line.includes('7d:')));assert.ok(lines.every(line=>displayWidth(line)<=16));
});
test('renderer preserves narrow Unicode display widths and advertises overflow pages',()=>{
 const config=preset('full');const s=sample();s.model='模型😀e\u0301'.repeat(20);
 for(const width of [20,40,100]){const result=render(s,config,{width,height:4,page:0,color:true});assert.ok(result.pages>1);assert.ok(result.lines.length<=4);for(const line of result.lines)assert.ok(displayWidth(line)<=width-4);assert.match(sanitize(result.lines.at(-1)),/1\//);}
 assert.equal(displayWidth('中😀e\u0301'),5);assert.equal(sanitize('\x1b]0;bad\x07\x1b[31mhello\x1b[0m\n'),'hello');
});
test('renderer reports unknown data and leaves no rows for disabled activity',()=>{
 let config=set(defaultConfig(),'display.showMcp',true);const output=render(emptySnapshot('abc'),config,{width:100,height:30,color:false}).lines;assert.ok(output.every(Boolean));assert.match(output.join('\n'),/未知|unknown/);assert.ok(!output.join('\n').includes('Tools'));
});
test('renderer supports semantic reordering, compact mode, merged groups and hostile text',()=>{
 let config=set(preset('minimal'),'display.showModel',true);config=set(config,'display.customLine','\x1b[2Jhello');config=set(config,'display.customLinePosition','first');config=set(config,'lineLayout','compact');const s=sample();s.model='\x1b]2;inject\x07safe';const out=render(s,config,{width:200,height:30,color:false}).lines.join('\n');assert.ok(out.startsWith('hello'));assert.ok(!out.includes('\x1b'));assert.match(out,/safe/);
 config=set(config,'lineLayout','expanded');config=set(config,'elementOrder',['context','project']);const ordered=render(sample(),config,{width:200,height:30,color:false}).lines;assert.match(ordered[1],/Context/);
});
