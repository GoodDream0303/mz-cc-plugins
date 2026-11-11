import test from 'node:test';import assert from 'node:assert/strict';
import {defaultConfig,set} from '../dist/config.js';import {render} from '../dist/render.js';import {emptySnapshot} from '../dist/types.js';
import {ensureHostDisplay} from '../dist/host-session.js';import {readLaunch} from '../dist/runtime.js';
import {hostFixture} from './support/host-fixture.mjs';
const api=await import('../dist/dynamic-height.js').catch(()=>({}));
async function fixture(t){
 const f=hostFixture(t),opened=await ensureHostDisplay(f.record,defaultConfig(),{role:'hook',dependencies:f.dependencies}),d=readLaunch(opened.launchFile),viewer=f.state.viewers[0];
 const state={rows:6,total:30,width:120,resizes:[],extra:false,wrongServer:false,queries:0};
 const pane=(id,pid,rows)=>['codex','@1',id,pid,state.width,rows,state.wrongServer?102:101].join('\t');
 const deps={...f.dependencies,pid:viewer.pid,run:args=>{
  if(args[2]==='list-panes'){state.queries++;return [pane('%1',201,state.total-state.rows),pane(viewer.pane,viewer.pid,state.rows),...(state.extra?[pane('%99',999,3)]:[])].join('\n');}
  if(args[2]==='display-message')return args[args.indexOf('-t')+1]==='%1'?pane('%1',201,state.total-state.rows):pane(viewer.pane,viewer.pid,state.rows);
  if(args[2]==='resize-pane'){assert.deepEqual(args.slice(0,6),['-L','mzhud-test','resize-pane','-t',viewer.pane,'-y']);state.rows=Number(args[6]);state.resizes.push(state.rows);return '';}
  throw Error('unexpected backend command');
 }};
 let config=set(set(defaultConfig(),'terminal.dynamicHeight',true),'terminal.paneSize',0.75);
 assert.equal(typeof api.DynamicHeightController,'function','live content-height controller is missing');
 return {...f,d,state,deps,config,controller:new api.DynamicHeightController(deps)};
}

test('live height follows stable 3 to 6 to 3 content with a delayed shrink',async t=>{
 const {controller,d,config,state}=await fixture(t);
 assert.equal(await controller.fit(d,config,3,0),undefined);assert.equal(await controller.fit(d,config,3,1999),undefined);
 assert.equal(await controller.fit(d,config,3,2000),3);
 assert.equal(await controller.fit(d,config,6,2100),undefined);assert.equal(await controller.fit(d,config,6,3100),6);
 assert.equal(await controller.fit(d,config,3,3200),undefined);assert.equal(await controller.fit(d,config,3,5199),undefined);assert.equal(await controller.fit(d,config,3,5200),3);
 assert.deepEqual(state.resizes,[3,6,3]);assert.equal(await controller.fit(d,config,3,9000),undefined);
});
test('only an outstanding growth suppresses the pager, not caps, fixed sizing or failures',async t=>{
 const {controller,d,config,state}=await fixture(t);state.rows=3;
 await controller.fit(d,config,6,0);assert.equal(controller.awaitingGrowth,true);
 await controller.fit(d,config,6,1000);assert.equal(controller.awaitingGrowth,false);
 state.rows=20;await controller.fit(d,config,60,2000);assert.equal(controller.awaitingGrowth,false);
 state.rows=3;await controller.fit(d,config,6,3000);await controller.fit(d,set(config,'terminal.dynamicHeight',false),6,3100);assert.equal(controller.awaitingGrowth,false);
 await controller.fit(d,config,6,4000);state.extra=true;await assert.rejects(async()=>await controller.fit(d,config,6,5000));assert.equal(controller.awaitingGrowth,false);
});

test('fixed sizing and disabling a pending live resize send no backend mutations',async t=>{
 const {controller,d,config,state}=await fixture(t),fixed=set(config,'terminal.dynamicHeight',false);
 await controller.fit(d,fixed,3,0);await controller.fit(d,fixed,3,9000);assert.deepEqual(state.resizes,[]);
 await controller.fit(d,config,3,10000);await controller.fit(d,fixed,3,11000);await controller.fit(d,config,3,12000);await controller.fit(d,config,3,13000);assert.deepEqual(state.resizes,[]);
});

test('live height caps overflow by ratio and preserves ten source rows in a small terminal',async t=>{
 const {controller,d,config,state}=await fixture(t);
 const capped=set(config,'terminal.paneSize',0.3);await controller.fit(d,capped,60,0);assert.equal(await controller.fit(d,capped,60,1000),9);
 state.total=13;state.rows=2;await controller.fit(d,config,60,2000);assert.equal(await controller.fit(d,config,60,3000),3);assert.equal(state.total-state.rows,10);
 state.total=10;state.rows=1;assert.equal(await controller.fit(d,config,60,4000),undefined);assert.deepEqual(state.resizes,[9,3]);
});

test('content fluctuations reset debounce and width-dependent wrapped rows drive height',async t=>{
 const {controller,d,config,state}=await fixture(t);
 await controller.fit(d,config,3,0);await controller.fit(d,config,4,1900);assert.equal(await controller.fit(d,config,4,2000),undefined);
 const wrapped=set(set(config,'display.showContextBar',false),'display.customLine','x'.repeat(120));
 const snapshot=emptySnapshot('parent');assert.equal(render(snapshot,wrapped,{width:120,height:100}).totalLines,2);assert.equal(render(snapshot,wrapped,{width:40,height:100}).totalLines,4);
 await controller.fit(d,wrapped,2,3000);assert.equal(await controller.fit(d,wrapped,2,5000),2);
 state.width=40;await controller.fit(d,wrapped,4,5100);assert.equal(await controller.fit(d,wrapped,4,6100),4);
});

test('changed source server and additional internal panes reject resizing without mutations',async t=>{
 for(const issue of ['wrongServer','extra']){
  const {controller,d,config,state}=await fixture(t);state[issue]=true;
  await assert.rejects(async()=>await controller.fit(d,config,3,0),/server|scope|panes|source/i);assert.deepEqual(state.resizes,[]);
 }
});

test('a stale viewer or replacement host display cannot resize another pane',async t=>{
 const {d,config,state,deps,root}=await fixture(t);
 const wrong=new api.DynamicHeightController({...deps,pid:999});await assert.rejects(async()=>await wrong.fit(d,config,3,0),/viewer|owner|identity/i);
 const stale=new api.DynamicHeightController({...deps,processes:()=>deps.processes().map(p=>p.pid===deps.pid?{...p,startedAt:'2026-11-03T02:00:00.000Z'}:p)});
 await stale.fit(d,config,3,0);await assert.rejects(async()=>await stale.fit(d,config,3,2000),/viewer|incarnation|identity/i);
 const fs=await import('node:fs');const record=JSON.parse(fs.readFileSync(d.host.recordFile,'utf8'));record.launchFile=root+'/runtime/00112233-4455-4677-8899-aabbccddeeff.json';fs.writeFileSync(d.host.recordFile,JSON.stringify(record));
 const replaced=new api.DynamicHeightController(deps);await assert.rejects(async()=>await replaced.fit(d,config,3,3000),/display|registration|host/i);assert.deepEqual(state.resizes,[]);
});

test('stable height avoids repeated backend queries but periodically rechecks manual resizing',async t=>{
 const {controller,d,config,state}=await fixture(t);
 await controller.fit(d,config,6,0,{columns:120,rows:6});
 for(const now of [1000,2000,4999])await controller.fit(d,config,6,now,{columns:120,rows:6});
 assert.equal(state.queries,1);assert.deepEqual(state.resizes,[]);
 state.rows=4;await controller.fit(d,config,6,5000,{columns:120,rows:6});
 assert.equal(state.queries,2);assert.equal(controller.awaitingGrowth,true);
 assert.equal(await controller.fit(d,config,6,6000,{columns:120,rows:6}),6);
 assert.deepEqual(state.resizes,[6]);
});

test('content, terminal geometry and ratio changes invalidate a stable height observation',async t=>{
 for(const change of ['content','columns','rows','ratio']){
  const {controller,d,config,state}=await fixture(t),geometry={columns:120,rows:6};
  await controller.fit(d,config,6,0,geometry);
  const nextGeometry={...geometry};if(change==='columns')nextGeometry.columns=80;if(change==='rows')nextGeometry.rows=5;
  await controller.fit(d,change==='ratio'?set(config,'terminal.paneSize',0.3):config,change==='content'?5:6,1000,nextGeometry);
  assert.equal(state.queries,2,change);
 }
});

test('cached stable geometry never hides replacement registration or authorizes a resize',async t=>{
 const {controller,d,config,state}=await fixture(t);
 await controller.fit(d,config,6,0);state.extra=true;
 await assert.rejects(async()=>await controller.fit(d,config,3,1000),/scope|panes|source/i);assert.deepEqual(state.resizes,[]);
 state.extra=false;await controller.fit(d,config,6,2000);
 const fs=await import('node:fs'),record=JSON.parse(fs.readFileSync(d.host.recordFile,'utf8'));
 record.launchFile=record.launchFile.replace(/[^/\\]+\.json$/,'00112233-4455-4677-8899-aabbccddeeff.json');fs.writeFileSync(d.host.recordFile,JSON.stringify(record));
 await assert.rejects(async()=>await controller.fit(d,config,6,2100),/registration|display|host/i);assert.deepEqual(state.resizes,[]);
});

test('growth uses its own 50ms deadline regardless of telemetry refresh interval',async t=>{
 const {controller,d,config,state}=await fixture(t);state.rows=3;
 await controller.fit(d,config,6,0);assert.equal(controller.nextCheckAt,50);
 assert.equal(await controller.fit(d,config,6,49),undefined);
 assert.equal(await controller.fit(d,config,6,50),6);assert.deepEqual(state.resizes,[6]);
});
test('a superseded asynchronous query cannot resize after stop or rebinding',async t=>{
 const {d,config,state,deps}=await fixture(t);state.rows=3;let current=true;
 const controller=new api.DynamicHeightController({...deps,processesAsync:async()=>{current=false;return deps.processes();}});
 await controller.fit(d,config,6,0,undefined,()=>current);
 assert.equal(await controller.fit(d,config,6,1000,undefined,()=>current),undefined);assert.deepEqual(state.resizes,[]);
});
test('an added pane during the async identity query rejects the pending resize',async t=>{
 const {d,config,state,deps}=await fixture(t);state.rows=3;
 const controller=new api.DynamicHeightController({...deps,processesAsync:async()=>{state.extra=true;return deps.processes();}});
 await controller.fit(d,config,6,0);
 await assert.rejects(()=>controller.fit(d,config,6,1000),/scope|panes/i);assert.deepEqual(state.resizes,[]);
});
