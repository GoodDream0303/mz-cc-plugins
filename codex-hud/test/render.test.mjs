import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {displayWidth,sanitize,wrapAnsi} from '../dist/terminal-text.js';import {defaultConfig,set,importClaude,preset} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
function sample(){return {...emptySnapshot('abc-session'),model:'gpt-example',effort:'high',cwd:'C:/项目/固件😀',context:{used:30,window:200},totals:{input:100,cached:80,output:20,reasoning:5,total:120},latest:{input:25,cached:20,output:5,reasoning:1,total:30},quotas:[{id:'codex:primary',minutes:10080,usedPercent:15,resetsAt:2000000000}],mcpUsed:['docs'],agents:[{id:'a',name:'分析',status:'unknown'}],todos:[{step:'验证驱动',status:'in_progress'}],tools:[{id:'t',name:'secret-tool',status:'running'}]};}
test('renderer respects imported activity preferences and weekly-only quota labels',()=>{
 const {config}=importClaude({display:{showTools:false,showAgents:true,showTodos:true,showMcp:true,showSessionTokens:true,sevenDayThreshold:0}});const text=render(sample(),config,{width:140,height:50,color:false}).lines.join('\n');
 assert.ok(!text.includes('secret-tool'));assert.match(text,/MCP/);assert.match(text,/分析/);assert.match(text,/验证驱动/);assert.match(text,/7d/);assert.ok(!text.includes('5h'));assert.match(text,/120/);assert.ok(!text.includes('200 Token'));
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
 let config=preset('minimal');config=set(config,'display.customLine','\x1b[2Jhello');config=set(config,'display.customLinePosition','first');config=set(config,'lineLayout','compact');const s=sample();s.model='\x1b]2;inject\x07safe';const out=render(s,config,{width:200,height:30,color:false}).lines.join('\n');assert.ok(out.startsWith('hello'));assert.ok(!out.includes('\x1b'));assert.match(out,/safe/);
 config=set(config,'lineLayout','expanded');config=set(config,'elementOrder',['context','project']);const ordered=render(sample(),config,{width:200,height:30,color:false}).lines;assert.match(ordered[1],/Context/);
});
