import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../dist/background-job.js').catch(()=>({}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('pending background work coalesces and only wakes once a result is available',async()=>{
 assert.equal(typeof api.BackgroundJob,'function','independent background jobs are missing');
 let wakes=0,calls=0;const pending=deferred(),job=new api.BackgroundJob(()=>wakes++);
 assert.equal(job.start('first',async()=>{calls++;return pending.promise;}),true);
 assert.equal(job.start('first',async()=>{calls++;return 99;}),false);await tick();
 assert.equal(job.busy,true);assert.equal(calls,1);assert.equal(wakes,0);assert.equal(job.take('first'),undefined);
 pending.resolve(42);await tick();assert.equal(job.busy,false);assert.equal(wakes,1);assert.deepEqual(job.take('first'),{value:42});assert.equal(job.take('first'),undefined);
});

test('replaced jobs abort old work and cannot publish a stale success or error',async()=>{
 assert.equal(typeof api.BackgroundJob,'function','independent background jobs are missing');
 for(const fail of [false,true]){
  let wakes=0,oldSignal;const old=deferred(),replacement=deferred(),job=new api.BackgroundJob(()=>wakes++);
  job.start('old',async signal=>{oldSignal=signal;return old.promise;});await tick();
  job.start('new',async()=>replacement.promise);assert.equal(oldSignal.aborted,true);
  if(fail)old.reject(Error('OLD-PRIVATE-DETAIL'));else old.resolve('old');await tick();
  assert.equal(job.take('old'),undefined);assert.equal(wakes,0);assert.equal(job.busy,true);
  replacement.resolve('new');await tick();assert.deepEqual(job.take('new'),{value:'new'});assert.equal(wakes,1);
 }
});

test('cancellation before dispatch starts no child work and accepts no later completion',async()=>{
 assert.equal(typeof api.BackgroundJob,'function','independent background jobs are missing');
 let calls=0,wakes=0;const job=new api.BackgroundJob(()=>wakes++);
 job.start('cancelled',async()=>{calls++;return 'stale';});job.cancel();await tick();
 assert.equal(calls,0);assert.equal(wakes,0);assert.equal(job.busy,false);assert.equal(job.take('cancelled'),undefined);
});

test('a failed background operation is consumed once and the same key can retry',async()=>{
 assert.equal(typeof api.BackgroundJob,'function','independent background jobs are missing');
 const job=new api.BackgroundJob(()=>{}),failure=Error('unavailable');job.start('git',async()=>{throw failure;});await tick();
 assert.deepEqual(job.take('git'),{error:failure});assert.equal(job.take('git'),undefined);assert.equal(job.busy,false);
 assert.equal(job.start('git',async()=>7),true);await tick();assert.deepEqual(job.take('git'),{value:7});
});
