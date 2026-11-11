import test from 'node:test';import assert from 'node:assert/strict';
import {render} from '../dist/render.js';import {defaultConfig,set} from '../dist/config.js';
import {emptySnapshot} from '../dist/types.js';import {displayWidth,sanitize} from '../dist/terminal-text.js';
const now=100000;
function config(){return set(set(set(defaultConfig(),'display.showTools',true),'display.showContextBar',false),'display.toolsMaxVisible',1);}
function tool(id,kind,status='done',name='exec_command'){return {id,name,status,action:{kind},finishedAt:now-1000};}
function output(tools,c=config(),options={}){return render({...emptySnapshot('parent'),tools},c,{width:240,height:100,color:false,now,...options});}

test('command calls aggregate by minor and status without exposing targets or mutating input',()=>{
 const tools=[{...tool('a','read'),action:{kind:'read',target:'SECRET.md'}},tool('b','read'),tool('c','read','failed')],before=structuredClone(tools);
 const text=output(tools).lines.join('\n');assert.match(text,/Run command ›/);assert.match(text,/✓ Read ×2/);assert.match(text,/✗ Read ×1/);assert.equal(text.split('Run command').length-1,1);assert.doesNotMatch(text,/SECRET|more/);assert.deepEqual(tools,before);
});

test('multiple operations remain one counted call and duplicate logical IDs never inflate counts',()=>{
 const first={...tool('a','mixed'),action:{kind:'mixed',operations:['read','search']}},second={...tool('b','mixed','done','functions.exec_command'),action:{kind:'mixed',operations:['search','read']}};
 const text=output([first,first,second]).lines.join('\n');assert.match(text,/Read\+Search ×2/);assert.equal(text.split('Run command').length-1,1);assert.doesNotMatch(text,/×3/);
});

test('every command minor remains visible despite a low unrelated-tool row limit',()=>{
 const cases=[['read','Read'],['search','Search'],['list','List'],['write','Edit'],['copy','Copy'],['move','Move'],['delete','Delete'],['archive','Archive'],['build','Build'],['test','Test'],['check','Check'],['benchmark','Benchmark'],['install','Dependencies'],['environment','Environment'],['process','Processes'],['network','Network'],['wait','Wait'],['git','Git']];
 const result=output(cases.map(([kind],i)=>tool(String(i),kind))),text=result.lines.join('\n');
 for(const [,label]of cases)assert.ok(text.includes(label+' ×1'),label);assert.doesNotMatch(text,/\+\d+ more|other \d|…/);
});

test('a major moves as a whole when only the remaining line space is insufficient',()=>{
 const tools=[tool('r','read'),tool('s','search'),tool('e','environment'),tool('script','check','done','exec')];
 const wide=output(tools,config(),{width:240}).lines;assert.equal(wide.length,1);assert.match(wide[0],/Run script.*\|.*Run command/);
 const narrow=output(tools,config(),{width:84}).lines;assert.equal(narrow.length,2);
 const commands=narrow.find(line=>line.includes('Environment'));for(const label of ['Run command','Read','Search','Environment'])assert.ok(commands.includes(label),label);assert.doesNotMatch(commands,/Run script/);assert.ok(narrow.every(line=>displayWidth(line)<=80));
});

test('oversized majors preserve all minors and repeat their ownership on continuation rows',()=>{
 const tools=['read','search','list','check','build','environment'].map((kind,i)=>tool(String(i),kind));
 for(const [language,major]of [['en','Cmd'],['zh-Hans','命令'],['zh-Hant','命令']]){
  const result=output(tools,set(config(),'language',language),{width:36}),lines=result.lines;
  assert.ok(lines.length>2);for(const line of lines.filter(line=>line.includes('×')))assert.ok(line.includes(major),line);
  assert.equal((lines.join('\n').match(/×1/g)||[]).length,6);assert.ok(lines.every(line=>displayWidth(line)<=32));
 }
});

test('current/recent counts, expiry, colors and all languages survive group packing',()=>{
 const previous=process.env.NO_COLOR;delete process.env.NO_COLOR;
 try{
  const tools=[tool('r1','read','running'),tool('r2','read','running','functions.exec_command'),tool('done','read'),tool('failed','test','failed','exec'),tool('cancel','test','cancelled','exec'),{...tool('old','network'),finishedAt:now-60001}];
  for(const language of ['en','zh-Hans','zh-Hant'])for(const layout of ['expanded','compact']){
   const c=set(set(config(),'language',language),'lineLayout',layout),plain=output(tools,c,{width:94}).lines,colored=output(tools,c,{width:94,color:true}).lines;
   assert.deepEqual(colored.map(sanitize),plain);assert.match(plain.join('\n'),/◐ .*×2/);assert.match(plain.join('\n'),/✗ .*×1/);assert.match(plain.join('\n'),/⊘ .*×1/);assert.equal((plain.join('\n').match(/×1/g)||[]).length,3);assert.ok(plain.every(line=>displayWidth(line)<=90));
   process.env.NO_COLOR='1';assert.deepEqual(output(tools,c,{width:94,color:true}).lines,plain);delete process.env.NO_COLOR;
  }
 }finally{if(previous===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=previous;}
});

test('unrecognized work stays a generic category while unrelated tools keep their existing limits',()=>{
 const tools=[tool('known','read'),{id:'unknown',name:'functions.exec_command',status:'done'},{id:'one',name:'other.exec',status:'done'},{id:'two',name:'mcp__docs__query',status:'done'}];
 const text=output(tools).lines.join('\n');assert.match(text,/Read ×1/);assert.match(text,/Unclassified ×1/);assert.match(text,/mcp__docs__query/);assert.doesNotMatch(text,/other\.exec|PowerShell/);
});
