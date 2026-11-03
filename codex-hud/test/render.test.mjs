import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {displayWidth,sanitize,wrapAnsi} from '../dist/terminal-text.js';import {defaultConfig,set,importClaude,preset} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
function sample(){return {...emptySnapshot('abc-session'),model:'gpt-example',effort:'high',cwd:'C:/项目/固件😀',context:{used:30,window:200},totals:{input:100,cached:80,output:20,reasoning:5,total:120},latest:{input:25,cached:20,output:5,reasoning:1,total:30},quotas:[{id:'codex:primary',minutes:10080,usedPercent:15,resetsAt:2000000000}],mcpUsed:['docs'],agents:[{id:'a',name:'分析',status:'unknown'}],todos:[{step:'验证驱动',status:'in_progress'}],tools:[{id:'t',name:'secret-tool',status:'running'}]};}
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
