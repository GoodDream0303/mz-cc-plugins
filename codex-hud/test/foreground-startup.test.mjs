import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';

function probe(t,mode='normal'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-foreground-first-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
 const config=path.join(root,'config.json'),command=path.join(root,'codex.exe');fs.writeFileSync(config,JSON.stringify({host:{autoStart:'enabled'}}));fs.writeFileSync(command,'synthetic official');
 const origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(root,'runtime/hosts'),namespace:'mzhud-first',tmux:'/tmp/psmux-101/mzhud-first,53001,0',session:'codex',pane:'%1',originId:'00112233-4455-4677-8899-aabbccddeeff'};
 const urls=['host-launch','runtime'].map(name=>pathToFileURL(path.resolve(import.meta.dirname,'../dist/'+name+'.js')).href),script=path.join(root,'probe.mjs');
 fs.writeFileSync(script,`import fs from 'node:fs';import cp from 'node:child_process';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';
 const origin=${JSON.stringify(origin)},mode=${JSON.stringify(mode)},owner={pid:process.pid,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'},viewer={pid:501,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z'};let file,queries=0,splits=0,frontends=0,atSpawn,now=1000,acknowledged=false;Date.now=()=>now;
 const clock=setInterval(()=>{if(splits&&!frontends)now+=9000;},10);clock.unref();
 cp.execFileSync=(binary,args)=>{
  if(binary==='powershell.exe'){queries++;return JSON.stringify([owner,server,...(acknowledged?[viewer]:[])]);}
  if(binary!==origin.binary)throw Error('unexpected query');
  if(args.includes('split-window')){splits++;file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString();if(mode==='split-failure')throw Error('lost split response');return '%2';}
  if(args.includes('list-panes'))return 'codex\\t@1\\t%1\\t'+owner.pid+'\\t120\\t40\\t101\\ncodex\\t@1\\t%2\\t501\\t120\\t4\\t101';
  const pane=args[args.indexOf('-t')+1];return 'codex\\t@1\\t'+pane+'\\t'+(pane==='%1'?owner.pid:viewer.pid)+'\\t120\\t'+(mode==='before-publication-failure'?'10':'40')+'\\t101';
 };
 cp.spawn=(binary,args)=>{
  frontends++;const host=JSON.parse(fs.readFileSync(origin.hostDir+'/'+origin.originId+'.json','utf8'));file=host.launchFile;
  atSpawn={queries,splits,phase:file?readLaunch(file).host.phase:undefined,args};const child=new EventEmitter();
  if(mode==='spawn-error'){setImmediate(()=>child.emit('error',Object.assign(Error('synthetic spawn failure'),{code:'ENOENT'})));return child;}
  if(mode==='early-exit'||mode.includes('failure')){setImmediate(()=>child.emit('exit',17));return child;}
  setImmediate(()=>{acknowledged=true;updateLaunch(file,d=>{d.state='running';d.pid=viewer.pid;d.host.hudPane='%2';d.host.hudProcess=viewer;d.host.phase='running';});});
  const timer=setInterval(()=>{if(queries>=2&&readLaunch(file).host.phase==='running'){clearInterval(timer);child.emit('exit',17);}},5);return child;
 };syncBuiltinESMExports();
 const {runHostOwner}=await import(${JSON.stringify(urls[0])}),{updateLaunch,readLaunch}=await import(${JSON.stringify(urls[1])});let code,error;
 try{code=await runHostOwner({command:${JSON.stringify(command)},args:['resume','literal-id','-m','literal-model','']},${JSON.stringify(config)});}catch(e){error=e.message;}
 const host=JSON.parse(fs.readFileSync(origin.hostDir+'/'+origin.originId+'.json','utf8')),display=host.launchFile?readLaunch(host.launchFile):undefined;console.log(JSON.stringify({code,error,queries,splits,frontends,atSpawn,state:host.state,exitCode:host.exitCode,hudStop:display?.hudStop,phase:display?.host.phase}));`);
 const env={...process.env,MZ_HUD_ORIGIN:origin.originId,MZ_HUD_PSMUX:origin.binary,MZ_HUD_HOST_DIR:origin.hostDir,MZ_HUD_NAMESPACE:origin.namespace,PSMUX_DATA_DIR:origin.dataDir,TMUX:origin.tmux,TMUX_PANE:origin.pane,PSMUX_SESSION:origin.session};
 const r=spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}

test('official frontend starts from the published intent before HUD acknowledgement and its fresh process proof',t=>{
 const r=probe(t);assert.equal(r.code,17);assert.equal(r.frontends,1);assert.equal(r.atSpawn.phase,'opening');assert.equal(r.atSpawn.queries,1);assert.equal(r.atSpawn.splits,0);assert.equal(r.queries,2);assert.equal(r.phase,'running');
 const encoded=r.atSpawn.args[r.atSpawn.args.indexOf('--invocation64')+1];assert.deepEqual(JSON.parse(Buffer.from(encoded,'base64')).args,['resume','literal-id','-m','literal-model','']);
});

test('foreground exit while HUD acknowledgement is pending cancels waiting and stops only its own display',t=>{
 const r=probe(t,'early-exit');assert.equal(r.code,17);assert.equal(r.atSpawn.phase,'opening');assert.equal(r.frontends,1);assert.equal(r.queries,1);assert.equal(r.state,'closed');assert.equal(r.exitCode,17);assert.equal(r.hudStop,true);
});

test('foreground spawn failure while HUD is opening is handled once and closes its host',t=>{
 const r=probe(t,'spawn-error');assert.match(r.error,/Foreground command could not start/);assert.equal(r.atSpawn.phase,'opening');assert.equal(r.frontends,1);assert.equal(r.state,'closed');assert.equal(r.exitCode,1);assert.equal(r.hudStop,true);
});

for(const mode of ['split-failure','before-publication-failure'])test('display '+mode+' still invokes the official frontend exactly once',t=>{
 const r=probe(t,mode);assert.equal(r.code,17);assert.equal(r.frontends,1);assert.equal(r.state,'closed');assert.equal(r.exitCode,17);assert.ok(r.splits<=1);if(mode==='split-failure')assert.equal(r.hudStop,true);
});
