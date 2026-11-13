import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {readProcessIdentities,hostProcessIds} from '../dist/psmux.js';
import {processBirthMicros} from '../dist/process-birth.js';
const api=await import('../dist/process-monitor.js').catch(()=>({}));

async function until(check,message){
 const expires=Date.now()+6000;
 while(Date.now()<expires){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.fail(message);
}

test('native monitoring keeps real process incarnations independent and recovers only its own observer',{skip:process.platform!=='win32'},async t=>{
 assert.equal(typeof api.ProcessMonitor,'function','native process observer is missing');
 const children=[],observers=[],monitors=[],legacyRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hud-legacy-observer-'));
 const originalSpawn=cp.spawn;
 cp.spawn=(file,args,options)=>{const child=originalSpawn(file,args,options);if(path.basename(String(file)).toLowerCase()==='process-events.exe')observers.push(child);return child;};syncBuiltinESMExports();
 t.after(async()=>{
  for(const monitor of monitors)monitor.close();
  for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill();
  cp.spawn=originalSpawn;syncBuiltinESMExports();
  await until(()=>observers.every(p=>p.exitCode!==null||p.signalCode!==null),'native observer leaked after close');
  fs.rmSync(legacyRoot,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 });
 for(let i=0;i<5;i++)children.push(cp.spawn(process.execPath,['-e','process.stdin.resume()'],{stdio:['pipe','ignore','ignore'],windowsHide:true}));
 const legacyExe=path.join(legacyRoot,'codex.exe');fs.copyFileSync(process.execPath,legacyExe);children.push(cp.spawn(legacyExe,['-e','process.stdin.resume()'],{stdio:['pipe','ignore','ignore'],windowsHide:true}));
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
 await t.test('final source-exit data is honored even when process exit precedes pipe delivery',async()=>{
  const monitor=create(owners[1]);await until(()=>monitor.status==='verified','drain observer did not start');const child=observers.at(-1);child.stdout.pause();
  children[1].kill();await until(()=>child.exitCode!==null||child.signalCode!==null,'native source-exit helper did not terminate');child.stdout.resume();
  await until(()=>monitor.status==='source-exited','final source exit was lost before stdout drained');
 });
 await t.test('an accepted legacy App Server incarnation stays in the fresh resize scope',async()=>{
  const legacy={...proof(viewer),appServer:{endpoint:'ws://127.0.0.1:53003/',process:owners[5]}},monitor=new api.ProcessMonitor(legacy,viewer,()=>{});monitors.push(monitor);monitor.reconcile();
  await until(()=>monitor.status==='verified','legacy observer did not start');assert.equal(owners[5].name.toLowerCase(),'codex.exe');assert.equal(owners[5].parentPid,viewer.pid);
  const values=await monitor.facts(hostProcessIds(legacy,[viewer.pid]));assert.deepEqual(values.find(p=>p.pid===owners[5].pid),owners[5]);
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
 await t.test('a native pipe error becomes unknown without throwing through the viewer',async()=>{
  const monitor=create(owners[3]);await until(()=>monitor.status==='verified','pipe-error observer did not start');const child=observers.at(-1);
  assert.doesNotThrow(()=>child.stdout.emit('error',Object.assign(Error('PRIVATE_PIPE_DETAIL'),{code:'EPIPE'})));
  assert.equal(monitor.status,'unknown');assert.ok(monitor.nextRetryAt>Date.now());
 });
 await t.test('a canceled request late error cannot retire a healthy observer',async()=>{
  const monitor=create(owners[3]);await until(()=>monitor.status==='verified','late-error observer did not start');const child=observers.at(-1);child.stdout.pause();
  const controller=new AbortController(),pending=monitor.facts([owners[3].pid],controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});
  child.stdout.emit('data','{"type":"error","code":"SNAPSHOT","id":1}\n');assert.equal(monitor.status,'verified');child.stdout.resume();
  const values=await monitor.facts([owners[3].pid]);assert.deepEqual(values[0],owners[3]);
 });
 await t.test('cancellation and close reject pending facts without accepting retired results',async()=>{
  const monitor=create(owners[4]);await until(()=>monitor.status==='verified','cancellation observer did not become verified');
  const child=observers.at(-1);child.stdout.pause();
  const controller=new AbortController(),cancelled=monitor.facts([owners[4].pid],controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  const pending=monitor.facts([owners[4].pid]);monitor.close();await assert.rejects(pending,/closed|stopped|observer/i);child.stdout.resume();
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(monitor.status,'closed');
 });
 await t.test('malformed and oversized native commands terminate without reporting a source exit',async()=>{
  for(const input of ['INVALID\n','x'.repeat(8192)+'\n']){
   const raw=cp.spawn(api.processHelperPath(),['--parent',String(process.pid),'--scope',viewer.pid+':'+processBirthMicros(viewer.startedAt)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   const messages=[];raw.stdin.on('error',()=>{});raw.stderr.resume();
   const lines=createInterface({input:raw.stdout});lines.on('line',line=>messages.push(JSON.parse(line)));
   await until(()=>messages.some(m=>m.type==='ready'),'raw native observer did not start');raw.stdin.write(input);
   await until(()=>raw.exitCode!==null,'malformed native command did not terminate');
   assert.equal(raw.exitCode,2);assert.ok(messages.some(m=>m.type==='error'&&m.code==='PROTOCOL'));assert.ok(messages.every(m=>m.type!=='exited'));
  }
 });
 await t.test('bounded pending queries reject overload and close releases every request',async()=>{
  const monitor=create(owners[4]);await until(()=>monitor.status==='verified','bounded observer did not start');const child=observers.at(-1);child.stdout.pause();
  const requests=Array.from({length:32},()=>monitor.facts([owners[4].pid]).then(()=>false,()=>true));
  await assert.rejects(monitor.facts([owners[4].pid]),/limit/i);monitor.close();child.stdout.resume();assert.ok((await Promise.all(requests)).every(Boolean));
 });
});

test('the native observer terminates when its real viewer parent is forcibly ended',{skip:process.platform!=='win32'},async t=>{
 assert.equal(typeof api.ProcessMonitor,'function','native process observer is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-observer-parent-')),script=path.join(root,'parent.mjs');let relay,identity;
 t.after(()=>{
  if(relay&&relay.exitCode===null&&relay.signalCode===null)relay.kill();
  if(identity){const fresh=readProcessIdentities([identity.pid]).find(p=>p.pid===identity.pid);if(fresh&&fresh.startedAt===identity.startedAt&&fresh.parentPid===identity.parentPid&&fresh.name===identity.name)process.kill(identity.pid);}
  fs.rmSync(root,{recursive:true,force:true});
 });
 const psmux=pathToFileURL(path.resolve(import.meta.dirname,'../dist/psmux.js')).href,birth=pathToFileURL(path.resolve(import.meta.dirname,'../dist/process-birth.js')).href;
 fs.writeFileSync(script,`import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {readProcessIdentities} from ${JSON.stringify(psmux)};import {processBirthMicros} from ${JSON.stringify(birth)};const self=readProcessIdentities([process.pid]).find(p=>p.pid===process.pid);const child=spawn(${JSON.stringify(api.processHelperPath())},['--parent',String(process.pid),'--scope',self.pid+':'+processBirthMicros(self.startedAt)],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();const lines=createInterface({input:child.stdout});lines.on('line',line=>{if(JSON.parse(line).type==='ready'){process.send({type:'ready'});setImmediate(()=>process.send({type:'identity',fact:readProcessIdentities([child.pid]).find(p=>p.pid===child.pid)}));}});process.on('message',()=>{});`);
 relay=cp.fork(script,[],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});relay.stderr.resume();let ready=false;
 relay.on('message',message=>{if(message.type==='ready')ready=true;if(message.type==='identity')identity=message.fact;});
 await until(()=>ready,'synthetic viewer did not open its native observer');await until(()=>identity,'synthetic observer identity was not reported');
 relay.kill();await until(()=>{try{process.kill(identity.pid,0);return false;}catch(error){return error.code==='ESRCH';}},'native observer remained after its viewer parent terminated');
});

test('native helper refuses modified package artifacts before execution',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof api.processHelperPath,'function','native helper verification is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-helper-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const original=api.processHelperPath();assert.equal(path.basename(original),'process-events.exe');
 fs.copyFileSync(original,path.join(root,'process-events.exe'));fs.copyFileSync(path.join(path.dirname(original),'process-events.json'),path.join(root,'process-events.json'));
 assert.equal(api.processHelperPath(root),path.join(root,'process-events.exe'));
 fs.appendFileSync(path.join(root,'process-events.exe'),'changed');assert.throws(()=>api.processHelperPath(root),/verified|checksum|integrity|artifact/i);
});

test('an oversized replacement is rejected before its bytes are read',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof api.processHelperPath,'function','native helper verification is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-helper-size-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binary=path.join(root,'process-events.exe'),original=api.processHelperPath();
 fs.copyFileSync(path.join(path.dirname(original),'process-events.json'),path.join(root,'process-events.json'));fs.writeFileSync(binary,Buffer.alloc(2*1024*1024));
 const read=fs.readFileSync;let oversizedReads=0;fs.readFileSync=(file,...args)=>{if(String(file)===binary)oversizedReads++;return read(file,...args);};
 try{assert.throws(()=>api.processHelperPath(root),/verified|checksum|integrity|artifact/i);}finally{fs.readFileSync=read;}
 assert.equal(oversizedReads,0,'unreasonable native artifact bytes were read before rejection');
});
