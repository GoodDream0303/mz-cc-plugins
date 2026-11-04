import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {defaultConfig,set} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
const now=Date.parse('2026-11-04T09:00:00Z');
const config=()=>set(set(defaultConfig(),'display.showContextBar',false),'display.showAgents',true);
const output=(agents,c=config(),at=now)=>render({...emptySnapshot('parent'),agents},c,{width:240,height:100,color:false,now:at}).lines;
test('each agent has its own row with action, actual model, elapsed time and child cumulative tokens',()=>{
 const agents=[{id:'a',name:'检查 sysm.c',status:'running',model:'model-a',action:'核对下电流程',startedAt:now-204000,totalTokens:137200},{id:'b',name:'review',status:'done',model:'model-b',startedAt:now-10000,endedAt:now-5000,totalTokens:3000}];
 const lines=output(agents);assert.equal(lines.length,2);assert.match(lines[0],/检查 sysm.c.*核对下电流程.*model-a.*3m 24s.*137.2k/);assert.doesNotMatch(lines[0],/review/);assert.match(lines[1],/review.*5s.*3k/);
 assert.match(output(agents,config(),now+10000)[1],/review.*5s/);
});
test('running work wins the row budget and older reported completions disappear',()=>{
 const agents=[{id:'old',name:'old',status:'done',endedAt:now-61000},...Array.from({length:4},(_,i)=>({id:'a'+i,name:'active-'+i,status:'running'})),{id:'done',name:'recent',status:'done',endedAt:now-1000}];
 const lines=output(agents),text=lines.join('\n');assert.equal(lines.filter(l=>l.includes('active-')).length,3);assert.match(text,/\+1.*running/);assert.doesNotMatch(text,/recent|old/);
 const all=output(agents,set(config(),'display.agentsMaxVisible',0)).join('\n');for(let i=0;i<4;i++)assert.match(all,new RegExp('active-'+i));assert.match(all,/recent/);assert.doesNotMatch(all,/\bold\b/);
});
test('completed history is limited to two and missing metrics are not invented',()=>{
 const agents=Array.from({length:4},(_,i)=>({id:'a'+i,name:'done-'+i,status:'done',endedAt:now-1000}));
 const lines=output(agents);assert.equal(lines.length,2);assert.match(lines[0],/time not reported/);assert.match(lines[0],/tokens not reported/);assert.match(lines[0],/model not reported/);
});
test('agent rows stay separate even in compact layout and on narrow terminals',()=>{
 const agents=[{id:'a',name:'alpha',status:'running'},{id:'b',name:'beta',status:'running'}];const lines=output(agents,set(config(),'lineLayout','compact'));assert.equal(lines.length,2);
 const narrow=render({...emptySnapshot('parent'),agents},config(),{width:40,height:3,color:false,now});assert.ok(narrow.pages>1);assert.ok(narrow.lines.length<=3);
});
test('tool summaries group successes, failures and cancellations separately while retaining active calls',()=>{
 const c=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),s={...emptySnapshot('parent'),tools:[{id:'r',name:'exec_command',status:'running'},{id:'a',name:'exec_command',status:'done'},{id:'b',name:'exec_command',status:'done'},{id:'c',name:'exec_command',status:'failed'},{id:'d',name:'exec_command',status:'cancelled'}]};
 const text=render(s,c,{width:240,height:30,color:false}).lines.join('\n');assert.match(text,/◐ exec_command/);assert.match(text,/✓ exec_command ×2/);assert.match(text,/✗ exec_command ×1/);assert.match(text,/⊘ exec_command ×1/);
});
test('unreported agents cannot evict known running work or be counted as running',()=>{
 const agents=[{id:'run',name:'actual-work',status:'running'},...Array.from({length:4},(_,i)=>({id:'u'+i,name:'unknown-'+i,status:'unreported'}))];
 const text=output(agents).join('\n');assert.match(text,/actual-work/);assert.doesNotMatch(text,/\+\d+ running/);assert.match(text,/\+2.*status not reported/);
});
test('old reported tool failures expire and current work is separate from recent history',()=>{
 const c=set(defaultConfig(),'display.showTools',true),s={...emptySnapshot('parent'),tools:[{id:'old',name:'old-failure',status:'failed',finishedAt:now-61000},{id:'fresh',name:'fresh-failure',status:'failed',finishedAt:now-1000},{id:'active',name:'exec_command',status:'running'}]};
 const text=render(s,c,{width:240,height:30,color:false,now}).lines.join('\n');assert.doesNotMatch(text,/old-failure/);assert.match(text,/Current:.*◐ exec_command/);assert.match(text,/Recent.*✗ fresh-failure/);
});
test('tool history keeps unknown completion ages and expires only after the sixty-second boundary',()=>{
 const c=set(defaultConfig(),'display.showTools',true),s={...emptySnapshot('parent'),tools:[{id:'unknown',name:'unknown-age',status:'failed'},{id:'boundary',name:'boundary-done',status:'done',finishedAt:now-60000}]};
 const text=at=>render(s,c,{width:240,height:30,color:false,now:at}).lines.join('\n');assert.match(text(now),/boundary-done/);assert.doesNotMatch(text(now+1),/boundary-done/);assert.match(text(now+3600000),/✗ unknown-age/);
});
