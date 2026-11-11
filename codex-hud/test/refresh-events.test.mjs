import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
const api=await import('../dist/refresh-events.js').catch(()=>({}));
const create=(...args)=>{assert.equal(typeof api.RefreshEvents,'function','event-driven wakeups are missing');return new api.RefreshEvents(...args);};

test('burst notifications merge and a priority stop bypasses the debounce',async()=>{
 const events=create();try{
  events.request('log',1000);events.request('log',1000);events.request('stop');
  assert.deepEqual([...await events.wait(Date.now()+5000)],['stop']);
  events.request('log');assert.deepEqual([...await events.wait(Date.now()+5000)],['log']);
  events.request('during-work');assert.deepEqual([...await events.wait(Date.now()+5000)],['during-work']);
 }finally{events.close();}
});
test('closing releases a pending wait and an expired deadline does not invent a change',async()=>{
 const events=create();assert.equal((await events.wait(Date.now())).size,0);
 const pending=events.wait(Infinity);events.close();assert.equal((await pending).size,0);
});
test('directory notifications filter unrelated files, share subscriptions and release handles',async()=>{
 const handles=[];const events=create((_dir,_options,listener)=>{const h=new EventEmitter();h.close=()=>{h.closed=true;};handles.push({h,listener});return h;});
 const one=events.watch(path.resolve('one.json'),'config'),two=events.watch(path.resolve('two.json'),'host');
 assert.equal(handles.length,1);handles[0].listener('change','other.json');assert.equal((await events.wait(Date.now()+40)).size,0);
 handles[0].listener('rename',null);assert.deepEqual(new Set(await events.wait(Date.now()+1000)),new Set(['config','host']));
 one();assert.equal(handles[0].h.closed,undefined);two();assert.equal(handles[0].h.closed,true);events.close();
});
test('native directory watch survives atomic replacement and reattaches a missing directory',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-events-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const events=create();t.after(()=>events.close());const dir=path.join(root,'later'),file=path.join(dir,'config.json');events.watch(file,'config');
 fs.mkdirSync(dir);fs.writeFileSync(file,'one');events.reconcile();await events.wait(Date.now());
 fs.writeFileSync(path.join(dir,'temporary'),'two');fs.renameSync(path.join(dir,'temporary'),file);
 assert.equal((await events.wait(Date.now()+2000)).has('config'),true);
 fs.writeFileSync(file,'three');assert.equal((await events.wait(Date.now()+2000)).has('config'),true);
});
test('watch failure wakes the source and a later reconcile retries without spinning',async()=>{
 let calls=0,handle;const events=create(()=>{calls++;if(calls===1)throw Error('unavailable');handle=new EventEmitter();handle.close=()=>{};return handle;});
 events.watch(path.resolve('config.json'),'config');assert.equal((await events.wait(Date.now()+1000)).has('config'),true);assert.equal(calls,1);
 events.reconcile();assert.equal(calls,2);handle.emit('error',Error('lost'));assert.equal((await events.wait(Date.now()+1000)).has('config'),true);events.close();
});
test('a validated heartbeat-only hint can be discarded without waking the worker',async()=>{
 const events=create(undefined,reason=>reason==='heartbeat'?false:undefined);
 try{events.request('heartbeat');assert.equal((await events.wait(Date.now()+40)).size,0);events.request('changed');assert.equal((await events.wait(Date.now()+1000)).has('changed'),true);}finally{events.close();}
});
test('replacing an attached directory retires the old handle and subscribes to the new directory',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-directory-replace-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'current');fs.mkdirSync(dir);const handles=[];
 const events=create((_dir,_options,listener)=>{const h=new EventEmitter();h.close=()=>{h.closed=true;};handles.push({h,listener});return h;});t.after(()=>events.close());
 events.watch(path.join(dir,'config.json'),'config');fs.renameSync(dir,path.join(root,'old'));fs.mkdirSync(dir);events.reconcile();
 assert.equal(handles.length,2);assert.equal(handles[0].h.closed,true);await events.wait(Date.now()+40);
 handles[1].listener('change','config.json');assert.equal((await events.wait(Date.now()+1000)).has('config'),true);
});
