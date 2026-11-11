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
