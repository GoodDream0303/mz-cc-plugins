import test from 'node:test';import assert from 'node:assert/strict';
import {defaultConfig,set} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
const api=await import('../dist/display-deadline.js').catch(()=>({}));
const next=(s,c,now)=>{assert.equal(typeof api.nextDisplayAt,'function','independent display deadlines are missing');return api.nextDisplayAt(s,c,now);};
test('quiet hidden fields have no display timer and Recent expires without new input',()=>{
 const s=emptySnapshot('clock'),c=defaultConfig();assert.equal(next(s,c,1000),Infinity);
 s.tools=[{id:'t',name:'exec',status:'done',finishedAt:1000}];assert.equal(next(s,c,2000),Infinity);
 assert.equal(next(s,set(c,'display.showTools',true),2000),61001);
});
test('elapsed ticks, session minutes and quota reset deadlines only exist for visible valid fields',()=>{
 const s=emptySnapshot('clock');let c=set(defaultConfig(),'display.showTools',true);s.tools=[{id:'t',name:'exec',status:'running',startedAt:0}];assert.equal(next(s,c,1000),2000);
 s.tools=[];s.startedAt=new Date(0).toISOString();c=set(c,'display.showDuration',true);assert.equal(next(s,c,1000),60000);
 c=set(c,'display.showDuration',false);s.quotas=[{minutes:300,usedPercent:50,resetsAt:2}];c=set(set(c,'display.showUsage',true),'display.timeFormat','absolute');assert.equal(next(s,c,1000),2000);
});
test('relative session start and last response advance without telemetry; absolute fields do not tick',()=>{
 for(const key of ['display.showSessionStartDate','display.showLastResponseAt']){
  const s=emptySnapshot('clock');s.startedAt=new Date(0).toISOString();s.lastResponseAt=new Date(0).toISOString();
  for(const format of ['relative','both']){const c=set(set(defaultConfig(),key,true),'display.timeFormat',format);assert.equal(next(s,c,1000),30001);}
  const absolute=set(set(defaultConfig(),key,true),'display.timeFormat','absolute');assert.equal(next(s,absolute,1000),Infinity);
 }
});
test('a render exactly at the relative minute rounding boundary still schedules the next millisecond',()=>{
 const s=emptySnapshot('clock');s.startedAt=new Date(0).toISOString();let c=set(set(defaultConfig(),'display.showSessionStartDate',true),'display.timeFormat','relative');
 assert.equal(next(s,c,30000),30001);assert.equal(next(s,c,30001),90001);
 s.startedAt=undefined;s.quotas=[{minutes:300,usedPercent:50,resetsAt:120}];c=set(c,'display.showUsage',true);assert.equal(next(s,c,30000),30001);
});
