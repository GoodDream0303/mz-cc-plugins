import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {defaultConfig,set} from '../dist/config.js';import {createLaunch,readLaunch,updateLaunch} from '../dist/runtime.js';import {acquireStartupLock} from '../dist/startup-lock.js';
const api=await import('../dist/host-session.js').catch(()=>({}));
function fixture(t,id='00112233-4455-4677-8899-aabbccddeeff'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-host-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(root,'hosts'),namespace:'mzhud-test',tmux:'/tmp/psmux-101/mzhud-test,53001,0',session:'codex',pane:'%1',originId:id};
 const owner={pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'};
 const state={splits:0,viewers:[],uncertain:false};const proof={origin,owner,server,window:'@1'};
 const dependencies={pid:201,processes:()=>[owner,server,...state.viewers],run:args=>{
  assert.deepEqual(args.slice(0,2),['-L','mzhud-test']);
  if(args[2]==='display-message'){
   const pane=args[args.indexOf('-t')+1];if(pane==='%1')return 'codex\t@1\t%1\t201\t120\t40\t101';
   const view=state.viewers.find(p=>p.pane===pane);if(!view)throw Error('pane no longer exists');return `codex\t@1\t${pane}\t${view.pid}\t120\t4\t101`;
  }
  assert.equal(args[2],'split-window');state.splits++;if(state.uncertain)throw Error('response lost after creation');
  const file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString(),view={pid:500+state.splits,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z',pane:'%'+(6+state.splits)};state.viewers.push(view);
  updateLaunch(file,d=>{d.state='running';d.pid=view.pid;d.host.hudPane=view.pane;d.host.hudProcess={pid:view.pid,parentPid:view.parentPid,name:view.name,startedAt:view.startedAt};d.host.phase='running';});return view.pane;
 }};
 return {root,proof,state,dependencies,options:{dependencies,waitMs:10},record:()=>api.registerHost(proof,origin.hostDir,root)};
}
test('bootstrap opens its own waiting HUD without any session log or model request',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','owner-bound display lifecycle is missing');
 const f=fixture(t),record=f.record();const result=await api.ensureHostDisplay(record,defaultConfig(),f.options);
 assert.equal(result.status,'opened');const d=readLaunch(result.launchFile);assert.equal(d.sessionId,undefined);assert.equal(d.transcriptPath,undefined);assert.equal(d.host.proof.owner.pid,201);assert.equal(d.host.hudPane,'%7');
 assert.equal((await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options)).status,'already-open');assert.equal(f.state.splits,1);
});
test('new hosts split exactly six HUD rows by default and keep later manual resizing',async t=>{
 for(const height of [20,40,80]){
  const f=fixture(t),run=f.dependencies.run,calls=[];
  f.dependencies.run=args=>{if(args[2]==='split-window')calls.push(args);const value=run(args);return args[2]==='display-message'&&args[args.indexOf('-t')+1]==='%1'?value.replace('\t40\t','\t'+height+'\t'):value;};
  const record=f.record(),opened=await api.ensureHostDisplay(record,defaultConfig(),f.options);
  assert.equal(calls[0][calls[0].indexOf('-l')+1],'6');assert.equal(readLaunch(opened.launchFile).initialSizing.rows,6);
  assert.equal((await api.ensureHostDisplay(api.readHost(record.file),set(defaultConfig(),'terminal.initialRows',10),f.options)).status,'already-open');assert.equal(calls.length,1);
 }
});
test('host sizing clamps row targets and retains explicit content and ratio modes',async t=>{
 for(const [height,config,expected,mode] of [[14,defaultConfig(),'3','rows'],[40,set(defaultConfig(),'terminal.autoHeight',true),'2','content'],[40,set(set(defaultConfig(),'terminal.initialRows',0),'terminal.paneSize',0.3),'12','ratio']]){
  const f=fixture(t),run=f.dependencies.run,calls=[];
  f.dependencies.run=args=>{if(args[2]==='split-window')calls.push(args);const value=run(args);return args[2]==='display-message'&&args[args.indexOf('-t')+1]==='%1'?value.replace('\t40\t','\t'+height+'\t'):value;};
  const opened=await api.ensureHostDisplay(f.record(),config,f.options);assert.equal(calls[0][calls[0].indexOf('-l')+1],expected);assert.equal(readLaunch(opened.launchFile).initialSizing.mode,mode);
 }
});
test('two physical owners of the same resumed thread retain independent displays',async t=>{
 assert.equal(typeof api.bindHostSession,'function','owner-specific data binding is missing');
 const a=fixture(t),b=fixture(t,'11112233-4455-4677-8899-aabbccddeeff');
 const one=await api.bindHostSession(a.record(),'same-thread',path.join(a.root,'a.jsonl'),{...a.options,config:defaultConfig()});
 const two=await api.bindHostSession(b.record(),'same-thread',path.join(b.root,'b.jsonl'),{...b.options,config:defaultConfig()});
 assert.notEqual(one.launchFile,two.launchFile);assert.equal(readLaunch(one.launchFile).transcriptPath,path.join(a.root,'a.jsonl'));assert.equal(readLaunch(two.launchFile).transcriptPath,path.join(b.root,'b.jsonl'));
});
test('switching thread updates only the exact owner display and never creates a second pane',async t=>{
 assert.equal(typeof api.bindHostSession,'function','owner-specific data binding is missing');
 const f=fixture(t),record=f.record();let one=await api.bindHostSession(record,'first-thread',path.join(f.root,'first.jsonl'),{...f.options,config:defaultConfig()});
 const next=await api.bindHostSession(api.readHost(record.file),'second-thread',path.join(f.root,'second.jsonl'),{...f.options,config:defaultConfig()});
 assert.equal(next.launchFile,one.launchFile);assert.equal(readLaunch(one.launchFile).sessionId,'second-thread');assert.equal(f.state.splits,1);
});
for(const foreign of [false,true])test('a SessionStart hook racing HUD creation '+(foreign?'rejects foreign ancestry':'binds the published intent without another split'),async t=>{
 const f=fixture(t),record=f.record(),frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},hook={pid:401,parentPid:foreign?999:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'};
 record.proof.frontend=frontend;const config=defaultConfig(),d=createLaunch(f.root,config,path.dirname(record.proof.origin.hostDir),path.join(f.root,'config.json'));
 record.launchFile=d.file;fs.writeFileSync(record.file,JSON.stringify(record));updateLaunch(d.file,v=>{v.host={recordFile:record.file,proof:record.proof,phase:'opening',reportedPane:'%7'};});
 const release=await acquireStartupLock(path.join(record.proof.origin.hostDir,'.locks',record.id));assert.ok(release);t.after(release);
 const dependencies={...f.dependencies,pid:401,processes:()=>[f.proof.owner,f.proof.server,frontend,hook]},transcript=path.join(f.root,'racing.jsonl');
 const bind=()=>api.bindHostSession(record,'racing-thread',transcript,{role:'hook',config,dependencies});
 if(foreign){await assert.rejects(bind,/origin|ancestry|frontend/i);assert.equal(readLaunch(d.file).sessionId,undefined);}
 else{const result=await bind();assert.equal(result.status,'busy');assert.equal(result.launchFile,d.file);assert.equal(readLaunch(d.file).sessionId,'racing-thread');assert.equal(readLaunch(d.file).transcriptPath,transcript);assert.equal(readLaunch(d.file).host.phase,'opening');}
 assert.equal(f.state.splits,0);
});

for(const mode of ['reused-viewer','wrong-pane'])test('a contended SessionStart binding rejects an acknowledged '+mode,async t=>{
 const f=fixture(t),record=f.record(),opened=await api.ensureHostDisplay(record,defaultConfig(),f.options),frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},hook={pid:401,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'};
 const current=api.readHost(record.file);current.proof.frontend=frontend;fs.writeFileSync(current.file,JSON.stringify(current));const viewer=readLaunch(opened.launchFile).host.hudProcess;
 const release=await acquireStartupLock(path.join(record.proof.origin.hostDir,'.locks',record.id));assert.ok(release);t.after(release);
 const dependencies={...f.dependencies,pid:401,processes:()=>[f.proof.owner,f.proof.server,frontend,hook,mode==='reused-viewer'?{...viewer,startedAt:'2026-11-03T02:00:04.000Z'}:viewer],run:args=>{const result=f.dependencies.run(args);return mode==='wrong-pane'&&args.includes('%7')?result.replace('@1','@2'):result;}};
 await assert.rejects(()=>api.bindHostSession(current,'wrong-viewer-thread',path.join(f.root,'wrong.jsonl'),{role:'hook',config:defaultConfig(),dependencies}),/viewer|pane|incarnation/i);
 assert.equal(readLaunch(opened.launchFile).sessionId,undefined);
});

test('a viewer acknowledged during contended hook proof is rechecked without losing its binding',async t=>{
 const f=fixture(t),record=f.record(),frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},hook={pid:401,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'},viewer={pid:501,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z',pane:'%7'};
 record.proof.frontend=frontend;const d=createLaunch(f.root,defaultConfig(),path.dirname(record.proof.origin.hostDir),path.join(f.root,'config.json'));record.launchFile=d.file;fs.writeFileSync(record.file,JSON.stringify(record));updateLaunch(d.file,v=>{v.host={recordFile:record.file,proof:record.proof,phase:'opening',reportedPane:'%7'};});f.state.viewers.push(viewer);
 const release=await acquireStartupLock(path.join(record.proof.origin.hostDir,'.locks',record.id));assert.ok(release);t.after(release);let queries=0;
 const dependencies={...f.dependencies,pid:401,processes:()=>{queries++;if(queries===1)updateLaunch(d.file,v=>{v.pid=viewer.pid;v.state='running';v.host.hudProcess=viewer;v.host.hudPane='%7';v.host.phase='running';});return [f.proof.owner,f.proof.server,frontend,hook,...(queries>1?[viewer]:[])];}};
 await api.bindHostSession(record,'racing-ack-thread',path.join(f.root,'ack.jsonl'),{role:'hook',config:defaultConfig(),dependencies});assert.equal(readLaunch(d.file).sessionId,'racing-ack-thread');assert.equal(queries,2,'newly acknowledged viewer needs a fresh physical/process proof');
});

test('a hook whose published intent is replaced during proof binds the current intent',async t=>{
 const f=fixture(t),record=f.record(),frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},hook={pid:401,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'};record.proof.frontend=frontend;
 const create=()=>{const d=createLaunch(f.root,defaultConfig(),path.dirname(record.proof.origin.hostDir),path.join(f.root,'config.json'));updateLaunch(d.file,v=>{v.host={recordFile:record.file,proof:record.proof,phase:'opening'};});return d;},first=create(),replacement=create();record.launchFile=first.file;fs.writeFileSync(record.file,JSON.stringify(record));
 const release=await acquireStartupLock(path.join(record.proof.origin.hostDir,'.locks',record.id));assert.ok(release);t.after(release);let queries=0;
 const dependencies={...f.dependencies,pid:401,processes:()=>{if(++queries===1){const current=api.readHost(record.file);current.launchFile=replacement.file;fs.writeFileSync(current.file,JSON.stringify(current));}return [f.proof.owner,f.proof.server,frontend,hook];}};
 const result=await api.bindHostSession(record,'replacement-thread',path.join(f.root,'replacement.jsonl'),{role:'hook',config:defaultConfig(),dependencies});assert.equal(result.launchFile,replacement.file);assert.equal(readLaunch(replacement.file).sessionId,'replacement-thread');assert.equal(readLaunch(first.file).sessionId,undefined);assert.equal(queries,2);
});

test('a lost split response stays uncertain and cannot create a duplicate on retry',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','display intents are missing');
 const f=fixture(t),record=f.record();f.state.uncertain=true;
 await assert.rejects(()=>api.ensureHostDisplay(record,defaultConfig(),f.options),/lost|uncertain/i);
 const saved=api.readHost(record.file);assert.equal(readLaunch(saved.launchFile).host.phase,'uncertain');
 await assert.rejects(()=>api.ensureHostDisplay(saved,defaultConfig(),f.options),/uncertain|pending/i);assert.equal(f.state.splits,1);
});
test('concurrent opens of one physical slot publish exactly one HUD',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','slot deduplication is missing');
 const f=fixture(t),record=f.record();const results=await Promise.all([api.ensureHostDisplay(record,defaultConfig(),f.options),api.ensureHostDisplay(record,defaultConfig(),f.options)]);
 assert.equal(f.state.splits,1);assert.deepEqual(new Set(results.map(r=>r.status)),new Set(['opened','already-open']));
});
test('a closed HUD is recreated only after its exact process has exited',async t=>{
 assert.equal(typeof api.ensureHostDisplay,'function','display reopening is missing');
 const f=fixture(t),record=f.record(),first=await api.ensureHostDisplay(record,defaultConfig(),f.options);
 updateLaunch(first.launchFile,d=>{d.state='exited';});
 assert.equal((await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options)).status,'stopping');assert.equal(f.state.splits,1);
 f.state.viewers=[];const next=await api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options);assert.equal(next.status,'opened');assert.notEqual(next.launchFile,first.launchFile);
});
test('closing one host requests only its owned HUD to stop',async t=>{
 assert.equal(typeof api.closeHost,'function','owner lifetime propagation is missing');
 const a=fixture(t),b=fixture(t,'11112233-4455-4677-8899-aabbccddeeff'),ar=a.record(),br=b.record();
 const first=await api.ensureHostDisplay(ar,defaultConfig(),a.options),second=await api.ensureHostDisplay(br,defaultConfig(),b.options);
 api.closeHost(api.readHost(ar.file),17);assert.equal(api.readHost(ar.file).exitCode,17);assert.equal(readLaunch(first.launchFile).hudStop,true);assert.equal(readLaunch(second.launchFile).hudStop,undefined);
});
test('cold viewer startup can finish its bounded process proof before acknowledgement expires',async t=>{
 const f=fixture(t),record=f.record(),original=f.dependencies.run;let timer;t.after(()=>clearTimeout(timer));
 f.dependencies.run=args=>{
  if(args[2]!=='split-window')return original(args);f.state.splits++;
  const file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString(),view={pid:501,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z',pane:'%7'};f.state.viewers.push(view);
  timer=setTimeout(()=>updateLaunch(file,d=>{d.state='running';d.pid=view.pid;d.host.hudPane=view.pane;d.host.hudProcess={pid:view.pid,parentPid:view.parentPid,name:view.name,startedAt:view.startedAt};d.host.phase='running';}),4200);return '%7';
 };
 const result=await api.ensureHostDisplay(record,defaultConfig(),{dependencies:f.dependencies});assert.equal(result.status,'opened');assert.equal(f.state.splits,1);
});
test('a returned pane that definitively disappeared can recover while a lost response stays uncertain',async t=>{
 const f=fixture(t),record=f.record(),original=f.dependencies.run;let first=true,absentConfirmed=false;
 f.dependencies.run=args=>{
  if(args[2]==='list-panes'){absentConfirmed=true;return 'codex\t@1\t%1\t201\t120\t40\t101';}
  if(absentConfirmed&&args[2]==='display-message'&&args.includes('%1'))assert.notEqual(readLaunch(api.readHost(record.file).launchFile).state,'exited','keep the old intent bindable until replacement publication');
  if(args[2]==='split-window'&&first){first=false;f.state.splits++;return '%7';}return original(args);
 };
 const transcript=path.join(f.root,'bound-before-recovery.jsonl');await assert.rejects(()=>api.ensureHostDisplay(record,defaultConfig(),{...f.options,binding:{id:'bound-before-recovery',transcript}}),/uncertain|timed out/i);
 const old=api.readHost(record.file),d=readLaunch(old.launchFile);assert.equal(d.host.reportedPane,'%7');
 const frontend={pid:301,parentPid:201,name:'node.exe',startedAt:'2026-11-03T01:00:02.000Z'};let registered=false;
 f.dependencies.processes=()=>{if(!registered){registered=true;const latest=api.readHost(record.file);latest.proof.frontend=frontend;fs.writeFileSync(latest.file,JSON.stringify(latest));}return [f.proof.owner,f.proof.server,frontend,...f.state.viewers];};
 const recovered=await api.ensureHostDisplay(old,defaultConfig(),f.options);assert.equal(recovered.status,'opened');assert.notEqual(recovered.launchFile,old.launchFile);assert.equal(f.state.splits,2);
 assert.equal(readLaunch(recovered.launchFile).sessionId,'bound-before-recovery');assert.equal(readLaunch(recovered.launchFile).transcriptPath,transcript);assert.deepEqual(api.readHost(record.file).proof.frontend,frontend,'recovery must preserve a concurrent frontend registration');
});
test('reported-pane recovery refuses a live pane, a failed query or a different server',async t=>{
 for(const mode of ['present','offline','wrong-server']){
  const f=fixture(t),record=f.record(),original=f.dependencies.run;
  f.dependencies.run=args=>{
   if(args[2]==='split-window'){f.state.splits++;return '%7';}
   if(args[2]==='list-panes'){
    if(mode==='offline')throw Error('backend offline');
    return mode==='wrong-server'?'codex\t@1\t%1\t201\t120\t40\t999':'codex\t@1\t%1\t201\t120\t40\t101\ncodex\t@1\t%7\t501\t120\t2\t101';
   }
   return original(args);
  };
  await assert.rejects(()=>api.ensureHostDisplay(record,defaultConfig(),f.options));await assert.rejects(()=>api.ensureHostDisplay(api.readHost(record.file),defaultConfig(),f.options));assert.equal(f.state.splits,1);
 }
});
