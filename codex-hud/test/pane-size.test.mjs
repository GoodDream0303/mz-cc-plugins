import test from 'node:test';import assert from 'node:assert/strict';
import {planInitialPaneSize} from '../dist/pane-size.js';
import {defaultConfig,set} from '../dist/config.js';
import {emptySnapshot} from '../dist/types.js';
test('initial pane height follows rendered content and parent rows',()=>{
 const config=set(set(defaultConfig(),'display.mergeGroups',[]),'terminal.autoHeight',true),snapshot=emptySnapshot('current-thread');
 const short=planInitialPaneSize(config,snapshot,{columns:120,rows:40});
 const tall=planInitialPaneSize(config,snapshot,{columns:120,rows:80});
 assert.equal(short.mode,'content');assert.ok(short.fraction<0.22);assert.ok(tall.fraction<short.fraction);
 assert.equal(short.contentRows,1);assert.equal(short.columns,120);
});
test('initial sizing respects owner space and a configured maximum fraction',()=>{
 const snapshot=emptySnapshot('current-thread');snapshot.errors=Array.from({length:30},(_,i)=>'Problem '+i);
 const sized=planInitialPaneSize(set(set(defaultConfig(),'terminal.paneSize',0.7),'terminal.autoHeight',true),snapshot,{columns:40,rows:20});
 assert.ok(sized.fraction<=0.5);assert.ok(sized.fraction>0);assert.ok(sized.contentRows>20);
});
test('fixed sizing and unavailable or invalid geometry preserve the configured fraction',()=>{
 const config=set(defaultConfig(),'terminal.paneSize',0.3),snapshot=emptySnapshot('current-thread');
 for(const view of [undefined,{columns:0,rows:40},{columns:80,rows:NaN},{columns:80,rows:5}])assert.deepEqual(planInitialPaneSize(config,snapshot,view),{mode:'ratio',fraction:0.3});
 assert.deepEqual(planInitialPaneSize(set(config,'terminal.initialRows',0),snapshot,{columns:80,rows:40}),{mode:'ratio',fraction:0.3});
});
test('fresh defaults request six visible HUD rows across viewport sizes without a ratio cap',()=>{
 for(const rows of [20,40,80]){
  const sized=planInitialPaneSize(defaultConfig(),emptySnapshot('thread'),{columns:120,rows});
  assert.equal(sized.mode,'rows');assert.equal(sized.rows,6);assert.equal(sized.parentRows,rows);
 }
 const short=planInitialPaneSize(defaultConfig(),emptySnapshot('thread'),{columns:120,rows:14});assert.equal(short.rows,3);
 assert.throws(()=>set(defaultConfig(),'terminal.initialRows',2.5));
});
