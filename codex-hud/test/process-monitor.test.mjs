import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {readProcessIdentities} from '../dist/psmux.js';
const api=await import('../dist/process-monitor.js').catch(()=>({}));

async function until(check,message){
 const expires=Date.now()+6000;
 while(Date.now()<expires){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.fail(message);
}

test('native monitoring keeps real process incarnations independent and recovers only its own observer',{skip:process.platform!=='win32'},async t=>{
 assert.equal(typeof api.ProcessMonitor,'function','native process observer is missing');
 const children=[],observers=[],monitors=[];
 const originalSpawn=cp.spawn;
 cp.spawn=(file,args,options)=>{const child=originalSpawn(file,args,options);if(path.basename(String(file)).toLowerCase()==='process-events.exe')observers.push(child);return child;};syncBuiltinESMExports();
 t.after(async()=>{
  for(const monitor of monitors)monitor.close();
  for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill();
  cp.spawn=originalSpawn;syncBuiltinESMExports();
  await until(()=>observers.every(p=>p.exitCode!==null||p.signalCode!==null),'native observer leaked after close');
 });
 for(let i=0;i<5;i++)children.push(cp.spawn(process.execPath,['-e','process.stdin.resume()'],{stdio:['pipe','ignore','ignore'],windowsHide:true}));
 const facts=readProcessIdentities(children.map(c=>c.pid)),viewer=facts.find(p=>p.pid===process.pid);assert.ok(viewer);
 const owners=children.map(c=>facts.find(p=>p.pid===c.pid));assert.ok(owners.every(Boolean));
 const proof=owner=>({origin:{originId:'00112233-4455-4677-8899-aabbccddeeff'},owner,server:viewer,window:'@1'});
 const create=owner=>{const monitor=new api.ProcessMonitor(proof(owner),viewer,()=>{});monitors.push(monitor);monitor.reconcile();return monitor;};

 await t.test('fresh requested facts retain actual parent/name and microsecond birth identity',async()=>{
  const monitor=create(owners[0]);await until(()=>monitor.status==='verified','native observer did not become verified');
  const values=await monitor.facts([viewer.pid,owners[0].pid]);assert.equal(values.length,2);
  for(const expected of [viewer,owners[0]])assert.deepEqual(values.find(p=>p.pid===expected.pid),expected);
  await assert.rejects(monitor.facts([owners[1].pid]),/scope|requested|allowed/i);
  assert.equal(monitor.status,'verified');
 });
 await t.test('one source exit cannot close an unrelated monitor',async()=>{
  const a=monitors[0],b=create(owners[1]);await until(()=>b.status==='verified','second observer did not become verified');
  children[0].kill();await until(()=>a.status==='source-exited','source exit was not observed');assert.equal(b.status,'verified');
 });
 await t.test('a reused PID with a different expected birth cannot become verified',async()=>{
  const stale=create({...owners[2],startedAt:'2026-01-01T00:00:00.0000000Z'});
  await until(()=>stale.status==='source-exited','different process incarnation was not rejected');
 });
 await t.test('observer failure retains unknown state and a retry reestablishes fresh identity',async()=>{
  const monitor=create(owners[3]);await until(()=>monitor.status==='verified','recovery observer did not become verified');
  const child=observers.at(-1);assert.equal(child.spawnfile,api.processHelperPath());child.kill();
  await until(()=>monitor.status==='unknown','failed observer did not become unknown');
  assert.ok(monitor.nextRetryAt>Date.now());
  monitor.reconcile(monitor.nextRetryAt);await until(()=>monitor.status==='verified','retry did not verify the still-live source');
 });
 await t.test('cancellation and close reject pending facts without accepting retired results',async()=>{
  const monitor=create(owners[4]);await until(()=>monitor.status==='verified','cancellation observer did not become verified');
  const child=observers.at(-1);child.stdout.pause();
  const controller=new AbortController(),cancelled=monitor.facts([owners[4].pid],controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  const pending=monitor.facts([owners[4].pid]);monitor.close();await assert.rejects(pending,/closed|stopped|observer/i);child.stdout.resume();
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(monitor.status,'closed');
 });
});

test('native helper refuses modified package artifacts before execution',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof api.processHelperPath,'function','native helper verification is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-helper-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const original=api.processHelperPath();assert.equal(path.basename(original),'process-events.exe');
 fs.copyFileSync(original,path.join(root,'process-events.exe'));fs.copyFileSync(path.join(path.dirname(original),'process-events.json'),path.join(root,'process-events.json'));
 assert.equal(api.processHelperPath(root),path.join(root,'process-events.exe'));
 fs.appendFileSync(path.join(root,'process-events.exe'),'changed');assert.throws(()=>api.processHelperPath(root),/verified|checksum|integrity|artifact/i);
});
