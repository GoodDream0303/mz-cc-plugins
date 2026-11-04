import test from 'node:test';import assert from 'node:assert/strict';
import {defaultConfig,set} from '../dist/config.js';import {render} from '../dist/render.js';import {emptySnapshot} from '../dist/types.js';
import {ensureHostDisplay} from '../dist/host-session.js';import {readLaunch} from '../dist/runtime.js';
import {hostFixture} from './support/host-fixture.mjs';
const api=await import('../dist/dynamic-height.js').catch(()=>({}));
async function fixture(t){
 const f=hostFixture(t),opened=await ensureHostDisplay(f.record,defaultConfig(),{role:'hook',dependencies:f.dependencies}),d=readLaunch(opened.launchFile),viewer=f.state.viewers[0];
 const state={rows:6,total:30,width:120,resizes:[],extra:false,wrongServer:false};
 const pane=(id,pid,rows)=>['codex','@1',id,pid,state.width,rows,state.wrongServer?102:101].join('\t');
 const deps={...f.dependencies,pid:viewer.pid,run:args=>{
  if(args[2]==='list-panes')return [pane('%1',201,state.total-state.rows),pane(viewer.pane,viewer.pid,state.rows),...(state.extra?[pane('%99',999,3)]:[])].join('\n');
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
 assert.equal(controller.fit(d,config,3,0),undefined);assert.equal(controller.fit(d,config,3,1999),undefined);
 assert.equal(controller.fit(d,config,3,2000),3);
 assert.equal(controller.fit(d,config,6,2100),undefined);assert.equal(controller.fit(d,config,6,3100),6);
 assert.equal(controller.fit(d,config,3,3200),undefined);assert.equal(controller.fit(d,config,3,5199),undefined);assert.equal(controller.fit(d,config,3,5200),3);
 assert.deepEqual(state.resizes,[3,6,3]);assert.equal(controller.fit(d,config,3,9000),undefined);
});

test('fixed sizing and disabling a pending live resize send no backend mutations',async t=>{
 const {controller,d,config,state}=await fixture(t),fixed=set(config,'terminal.dynamicHeight',false);
 controller.fit(d,fixed,3,0);controller.fit(d,fixed,3,9000);assert.deepEqual(state.resizes,[]);
 controller.fit(d,config,3,10000);controller.fit(d,fixed,3,11000);controller.fit(d,config,3,12000);controller.fit(d,config,3,13000);assert.deepEqual(state.resizes,[]);
});

test('live height caps overflow by ratio and preserves ten source rows in a small terminal',async t=>{
 const {controller,d,config,state}=await fixture(t);
 const capped=set(config,'terminal.paneSize',0.3);controller.fit(d,capped,60,0);assert.equal(controller.fit(d,capped,60,1000),9);
 state.total=13;state.rows=2;controller.fit(d,config,60,2000);assert.equal(controller.fit(d,config,60,3000),3);assert.equal(state.total-state.rows,10);
 state.total=10;state.rows=1;assert.equal(controller.fit(d,config,60,4000),undefined);assert.deepEqual(state.resizes,[9,3]);
});

test('content fluctuations reset debounce and width-dependent wrapped rows drive height',async t=>{
 const {controller,d,config,state}=await fixture(t);
 controller.fit(d,config,3,0);controller.fit(d,config,4,1900);assert.equal(controller.fit(d,config,4,2000),undefined);
 const wrapped=set(set(config,'display.showContextBar',false),'display.customLine','x'.repeat(120));
 const snapshot=emptySnapshot('parent');assert.equal(render(snapshot,wrapped,{width:120,height:100}).totalLines,2);assert.equal(render(snapshot,wrapped,{width:40,height:100}).totalLines,4);
 controller.fit(d,wrapped,2,3000);assert.equal(controller.fit(d,wrapped,2,5000),2);
 state.width=40;controller.fit(d,wrapped,4,5100);assert.equal(controller.fit(d,wrapped,4,6100),4);
});

test('changed source server and additional internal panes reject resizing without mutations',async t=>{
 for(const issue of ['wrongServer','extra']){
  const {controller,d,config,state}=await fixture(t);state[issue]=true;
  assert.throws(()=>controller.fit(d,config,3,0),/server|scope|panes|source/i);assert.deepEqual(state.resizes,[]);
 }
});

test('a stale viewer or replacement host display cannot resize another pane',async t=>{
 const {d,config,state,deps,root}=await fixture(t);
 const wrong=new api.DynamicHeightController({...deps,pid:999});assert.throws(()=>wrong.fit(d,config,3,0),/viewer|owner|identity/i);
 const stale=new api.DynamicHeightController({...deps,processes:()=>deps.processes().map(p=>p.pid===deps.pid?{...p,startedAt:'2026-11-03T02:00:00.000Z'}:p)});
 stale.fit(d,config,3,0);assert.throws(()=>stale.fit(d,config,3,2000),/viewer|incarnation|identity/i);
 const fs=await import('node:fs');const record=JSON.parse(fs.readFileSync(d.host.recordFile,'utf8'));record.launchFile=root+'/runtime/00112233-4455-4677-8899-aabbccddeeff.json';fs.writeFileSync(d.host.recordFile,JSON.stringify(record));
 const replaced=new api.DynamicHeightController(deps);assert.throws(()=>replaced.fit(d,config,3,3000),/display|registration|host/i);assert.deepEqual(state.resizes,[]);
});
