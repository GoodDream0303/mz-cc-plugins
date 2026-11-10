import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';

function probe(t,changed=false,expired=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-startup-proof-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
 const config=path.join(root,'config.json'),command=path.join(root,'codex.exe');fs.writeFileSync(config,JSON.stringify({host:{autoStart:'enabled'}}));fs.writeFileSync(command,'synthetic official');
 const origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(root,'runtime/hosts'),namespace:'mzhud-startup',tmux:'/tmp/psmux-101/mzhud-startup,53001,0',session:'codex',pane:'%1',originId:'00112233-4455-4677-8899-aabbccddeeff'};
 const imports=['host-launch','runtime'].map(name=>pathToFileURL(path.resolve(import.meta.dirname,'../dist/'+name+'.js')).href),script=path.join(root,'probe.mjs');
 fs.writeFileSync(script,`import fs from 'node:fs';import cp from 'node:child_process';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';
 const origin=${JSON.stringify(origin)},changed=${JSON.stringify(changed)},expired=${JSON.stringify(expired)},owner={pid:process.pid,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'},viewer={pid:501,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z'};let queries=0,splits=0,frontends=0,now=1000;Date.now=()=>now;
 const write=fs.writeFileSync;fs.writeFileSync=(file,...args)=>{if(expired&&String(file).startsWith(origin.hostDir)&&String(file).endsWith('.tmp'))now=1200;return write(file,...args);};
 cp.execFileSync=(binary,args)=>{if(binary==='powershell.exe'){queries++;return JSON.stringify([queries>1&&changed?{...owner,startedAt:'2026-11-03T02:00:01.000Z'}:owner,server,...(splits?[viewer]:[])]);}if(binary===origin.binary){if(args.includes('split-window')){splits++;const file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString();updateLaunch(file,d=>{d.state='running';d.pid=viewer.pid;d.host.hudPane='%2';d.host.hudProcess=viewer;d.host.phase='running';});return '%2';}const pane=args[args.indexOf('-t')+1];return 'codex\\t@1\\t'+pane+'\\t'+(pane==='%1'?owner.pid:viewer.pid)+'\\t120\\t40\\t101';}throw Error('unexpected query');};
 cp.spawn=()=>{frontends++;const child=new EventEmitter();setImmediate(()=>child.emit('exit',17));return child;};syncBuiltinESMExports();
 const {runHostOwner}=await import(${JSON.stringify(imports[0])}),{updateLaunch}=await import(${JSON.stringify(imports[1])});let code,error;try{code=await runHostOwner({command:${JSON.stringify(command)},args:['resume','literal-id']},${JSON.stringify(config)});}catch(e){error=e.message;}const h=JSON.parse(fs.readFileSync(origin.hostDir+'/'+origin.originId+'.json','utf8')),phase=h.launchFile?JSON.parse(fs.readFileSync(h.launchFile,'utf8')).host.phase:undefined;console.log(JSON.stringify({queries,splits,frontends,code,error,phase}));`);
 const env={...process.env,MZ_HUD_ORIGIN:origin.originId,MZ_HUD_PSMUX:origin.binary,MZ_HUD_HOST_DIR:origin.hostDir,MZ_HUD_NAMESPACE:origin.namespace,PSMUX_DATA_DIR:origin.dataDir,TMUX:origin.tmux,TMUX_PANE:origin.pane,PSMUX_SESSION:origin.session};
 const result=spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}

test('new host startup shares its immediate owner snapshot but obtains fresh facts after viewer acknowledgement',t=>{
 const result=probe(t);assert.equal(result.code,17);assert.equal(result.splits,1);assert.equal(result.frontends,1);assert.equal(result.phase,'running');assert.equal(result.queries,2,'owner proof and immediate initial display verification must not repeat the same slow query');
});

test('bootstrap observations expire instead of bypassing a later process query',t=>{
 const result=probe(t,false,true);assert.equal(result.code,17);assert.equal(result.phase,'running');assert.equal(result.queries,3);
});

test('a changed owner incarnation at viewer acknowledgement cannot be accepted from the bootstrap observation',t=>{
 const result=probe(t,true);assert.equal(result.code,17);assert.equal(result.splits,1);assert.notEqual(result.phase,'running');assert.ok(result.queries>=3);
});
