import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {defaultConfig,set} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
import {displayWidth,sanitize} from '../dist/terminal-text.js';
const now=Date.parse('2026-11-04T09:00:00Z');
const config=()=>set(set(defaultConfig(),'display.showContextBar',false),'display.showAgents',true);
const output=(agents,c=config(),at=now)=>render({...emptySnapshot('parent'),agents},c,{width:240,height:100,color:false,now:at}).lines;
test('section headings use compact icons and a distinct foreground in every language and layout',()=>{
 const previous=process.env.NO_COLOR;delete process.env.NO_COLOR;
 try{
  const s={...emptySnapshot('parent'),tools:[{id:'run',name:'exec',status:'running'},{id:'done',name:'exec_command',status:'done'}],agents:[{id:'agent',name:'worker',status:'running'}],todos:[{step:'Verify output',status:'in_progress'}]};
  for(const icon of ['▸','◷','◈','≡'])assert.equal(displayWidth(icon),1);
  for(const [language,titles]of [['en',['Current','Recent','Agents','Todo']],['zh-Hans',['当前','近期','子代理','待办']],['zh-Hant',['目前','近期','子代理','待辦']]])for(const layout of ['expanded','compact']){
   const c=set(set(set(set(config(),'language',language),'lineLayout',layout),'display.showTools',true),'display.showTodos',true),options={width:44,height:100,now};
   const plain=render(s,c,{...options,color:false}).lines,colored=render(s,c,{...options,color:true}).lines;
   for(const [i,icon]of ['▸','◷','◈','≡'].entries()){
    const heading=icon+' '+titles[i]+':';assert.ok(plain.some(line=>line.startsWith(heading)),heading);assert.ok(colored.find(line=>sanitize(line).startsWith(heading)).includes('\x1b[38;2;186;194;206m'));
   }
   assert.ok(plain.every(line=>displayWidth(line)<=40));assert.deepEqual(colored.map(sanitize),plain);
   process.env.NO_COLOR='1';assert.deepEqual(render(s,c,{...options,color:true}).lines,plain);delete process.env.NO_COLOR;
  }
 }finally{if(previous===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=previous;}
});
test('each agent has its own row with action, actual model, elapsed time and child cumulative tokens',()=>{
 const agents=[{id:'a',name:'检查 sysm.c',status:'running',model:'model-a',action:'核对下电流程',startedAt:now-204000,totalTokens:137200},{id:'b',name:'review',status:'done',model:'model-b',startedAt:now-10000,endedAt:now-5000,totalTokens:3000}];
 const lines=output(agents);assert.equal(lines.length,3);assert.equal(lines[0],'◈ Agents:');assert.match(lines[1],/^  ◐ 检查 sysm.c.*核对下电流程.*model-a.*3m 24s.*137.2k/);assert.doesNotMatch(lines[1],/review/);assert.match(lines[2],/^  ✓ review.*5s.*3k/);
 assert.match(output(agents,config(),now+10000)[2],/review.*5s/);
});
test('running work wins the row budget and older reported completions disappear',()=>{
 const agents=[{id:'old',name:'old',status:'done',endedAt:now-61000},...Array.from({length:4},(_,i)=>({id:'a'+i,name:'active-'+i,status:'running'})),{id:'done',name:'recent',status:'done',endedAt:now-1000}];
 const lines=output(agents),text=lines.join('\n');assert.equal(lines.filter(l=>l.includes('active-')).length,3);assert.match(text,/\+1.*running/);assert.doesNotMatch(text,/recent|old/);
 const all=output(agents,set(config(),'display.agentsMaxVisible',0)).join('\n');for(let i=0;i<4;i++)assert.match(all,new RegExp('active-'+i));assert.match(all,/recent/);assert.doesNotMatch(all,/\bold\b/);
});
test('completed history is limited to two and missing metrics are not invented',()=>{
 const agents=Array.from({length:4},(_,i)=>({id:'a'+i,name:'done-'+i,status:'done',endedAt:now-1000}));
 const lines=output(agents);assert.equal(lines.length,3);assert.match(lines[1],/time not reported/);assert.match(lines[1],/tokens not reported/);assert.match(lines[1],/model not reported/);
});
test('agent rows stay separate even in compact layout and on narrow terminals',()=>{
 const agents=[{id:'a',name:'alpha',status:'running'},{id:'b',name:'beta',status:'running'}];const lines=output(agents,set(config(),'lineLayout','compact'));assert.equal(lines.length,3);assert.equal(lines[0],'◈ Agents:');assert.ok(lines.slice(1).every(line=>line.startsWith('  ◐ ')));
 const narrow=render({...emptySnapshot('parent'),agents},config(),{width:40,height:3,color:false,now});assert.ok(narrow.pages>1);assert.ok(narrow.lines.length<=3);
});
test('tool summaries group successes, failures and cancellations separately while retaining active calls',()=>{
 const c=set(set(defaultConfig(),'display.showTools',true),'display.toolsMaxVisible',0),s={...emptySnapshot('parent'),tools:[{id:'r',name:'exec_command',status:'running'},{id:'a',name:'exec_command',status:'done'},{id:'b',name:'exec_command',status:'done'},{id:'c',name:'exec_command',status:'failed'},{id:'d',name:'exec_command',status:'cancelled'}]};
 const text=render(s,c,{width:240,height:30,color:false}).lines.join('\n');assert.match(text,/◐ Run command/);assert.match(text,/✓ Run command ×2/);assert.match(text,/✗ Run command ×1/);assert.match(text,/⊘ Run command ×1/);
});
test('unreported agents cannot evict known running work or be counted as running',()=>{
 const agents=[{id:'run',name:'actual-work',status:'running'},...Array.from({length:4},(_,i)=>({id:'u'+i,name:'unknown-'+i,status:'unreported'}))];
 const text=output(agents).join('\n');assert.match(text,/actual-work/);assert.doesNotMatch(text,/\+\d+ running/);assert.match(text,/\+2.*status not reported/);
});
test('old reported tool failures expire and current work is separate from recent history',()=>{
 const c=set(defaultConfig(),'display.showTools',true),s={...emptySnapshot('parent'),tools:[{id:'old',name:'old-failure',status:'failed',finishedAt:now-61000},{id:'fresh',name:'fresh-failure',status:'failed',finishedAt:now-1000},{id:'active',name:'exec_command',status:'running'}]};
 const text=render(s,c,{width:240,height:30,color:false,now}).lines.join('\n');assert.doesNotMatch(text,/old-failure/);assert.match(text,/Current:.*◐ Run command/);assert.match(text,/Recent.*✗ fresh-failure/);
});
test('tool history keeps unknown completion ages and expires only after the sixty-second boundary',()=>{
 const c=set(defaultConfig(),'display.showTools',true),s={...emptySnapshot('parent'),tools:[{id:'unknown',name:'unknown-age',status:'failed'},{id:'boundary',name:'boundary-done',status:'done',finishedAt:now-60000}]};
 const text=at=>render(s,c,{width:240,height:30,color:false,now:at}).lines.join('\n');assert.match(text(now),/boundary-done/);assert.doesNotMatch(text(now+1),/boundary-done/);assert.match(text(now+3600000),/✗ unknown-age/);
});

test('activity text emphasis follows lifecycle changes without backgrounds or font weight changes',()=>{
 const previous=process.env.NO_COLOR;delete process.env.NO_COLOR;
 try{
  const c=set(config(),'display.showTools',true),s={...emptySnapshot('parent'),tools:[{id:'tool',name:'exec',status:'running'},{id:'failed',name:'build',status:'failed'}],agents:[{id:'agent',name:'worker',status:'running'}]};
  const lines=()=>render(s,c,{width:240,height:100,color:true,now}).lines;
  const bright='\x1b[38;2;242;242;242m',gray='\x1b[38;2;154;154;154m';
  let result=lines();assert.ok(result.find(line=>line.includes('Run script')).includes(bright));assert.ok(result.find(line=>line.includes('worker')).includes(bright));assert.match(result.find(line=>line.includes('build')),/\x1b\[31m/);
  s.tools[0].status='done';s.tools[0].finishedAt=now;
  for(const status of ['starting','running','done','interrupted','closed','unknown','unreported','failed']){
   s.agents[0].status=status;result=lines();const row=result.find(line=>line.includes('worker'));
   assert.ok(row.includes(['starting','running'].includes(status)?bright:gray),status);
   assert.ok(result.find(line=>line.includes('Run script')).includes(gray));
   assert.doesNotMatch(result.join('\n'),/\x1b\[(?:1|7|4\d|10\d|48[;\d]*)m/);
  }
  const plain=render(s,c,{width:240,height:100,color:false,now}).lines;
  assert.deepEqual(result.map(sanitize),plain);assert.ok(plain.every(line=>!line.includes('\x1b')));
  process.env.NO_COLOR='1';assert.deepEqual(lines(),plain);
 }finally{if(previous===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=previous;}
});

test('activity headings and wrapped agent entries stay separate without blank rows',()=>{
 const agents=[{id:'a',name:'long-worker-name',status:'running',model:'actual-model',action:'check the board and review the implementation',startedAt:now-5000,totalTokens:1000}];
 for(const [language,heading]of [['en','◈ Agents:'],['zh-Hans','◈ 子代理:'],['zh-Hant','◈ 子代理:']])for(const layout of ['expanded','compact']){
  const c=set(set(set(config(),'language',language),'lineLayout',layout),'display.showTools',true),s={...emptySnapshot('parent'),agents,tools:[{id:'t',name:'exec',status:'running'},{id:'r',name:'exec_command',status:'done'}]};
  const lines=render(s,c,{width:44,height:100,color:false,now}).lines,headingIndex=lines.indexOf(heading);
  assert.ok(headingIndex>0);assert.match(lines[headingIndex-1],/Recent:|近期:/);
  assert.ok(lines.slice(headingIndex+1).every(line=>line.startsWith('  ')));
  assert.ok(lines.every(line=>line.length>0&&displayWidth(line)<=40));
 }
});

test('custom activity foregrounds survive wrapping without leaking into other groups',()=>{
 const previous=process.env.NO_COLOR;delete process.env.NO_COLOR;
 try{
  const c=set(set(config(),'colors.active','#abcdef'),'colors.inactive',244),s={...emptySnapshot('parent'),agents:[{id:'a',name:'active-worker-with-a-long-name',status:'running'},{id:'b',name:'finished-worker-with-a-long-name',status:'done'}]};
  const lines=render(s,c,{width:34,height:100,color:true,now}).lines;
  assert.equal(sanitize(lines[0]),'◈ Agents:');assert.doesNotMatch(lines[0],/38;2;171;205;239|38;5;244/);
  let inactive=false;
  for(const line of lines.slice(1)){
   if(sanitize(line).includes('✓'))inactive=true;
   assert.ok(line.includes(inactive?'\x1b[38;5;244m':'\x1b[38;2;171;205;239m'));
   assert.ok(line.startsWith('  '));assert.ok(line.endsWith('\x1b[0m'));assert.ok(displayWidth(line)<=30);
  }
 }finally{if(previous===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=previous;}
});
