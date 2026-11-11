import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const api=await import('../dist/psmux.js').catch(()=>({}));
const binary=path.resolve('portable/psmux.exe'),dataDir=path.resolve('host-data'),hostDir=path.resolve('hosts');
const origin={binary,dataDir,hostDir,namespace:'mzhud-test',tmux:'/tmp/psmux-101/mzhud-test,53001,0',session:'codex',pane:'%1',originId:'00112233-4455-4677-8899-aabbccddeeff'};
const environment={MZ_HUD_PSMUX:binary,PSMUX_DATA_DIR:dataDir,MZ_HUD_HOST_DIR:hostDir,MZ_HUD_NAMESPACE:origin.namespace,TMUX:origin.tmux,TMUX_PANE:origin.pane,PSMUX_SESSION:'codex',MZ_HUD_ORIGIN:origin.originId};
const owner={pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'};
const server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'};
const frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'};
const hook={pid:401,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'};
const pane='codex\t@1\t%1\t201\t120\t40\t101';
function deps(overrides={}){return {pid:401,processes:()=>[hook,frontend,owner,server],run:(args)=>{assert.deepEqual(args.slice(0,2),['-L','mzhud-test']);assert.equal(args[2],'display-message');return pane;},...overrides};}
test('origin must establish a consistent namespace, endpoint and source pane before commands run',()=>{
 assert.equal(typeof api.readHostOrigin,'function','physical host resolver is missing');
 assert.deepEqual(api.readHostOrigin(environment),origin);
 for(const changes of [{TMUX_PANE:undefined},{TMUX:'/tmp/psmux-101/another,53001,0'},{PSMUX_DATA_DIR:'relative'},{MZ_HUD_PSMUX:'psmux.exe'},{PSMUX_SERVER_MODE:'shared'},{MZ_HUD_ORIGIN:'../../other'}])assert.throws(()=>api.readHostOrigin({...environment,...changes}),/host|origin|namespace|endpoint|pane|absolute|shared/i);
});
test('a genuine Codex ancestor proves the hook belongs to this exact physical owner',()=>{
 assert.equal(typeof api.verifyHost,'function','host proof verification is missing');
 const proof={origin,owner,server,window:'@1',frontend};
 assert.deepEqual(api.verifyHost(proof,'hook',deps()),proof);
 for(const processes of [[hook,{...frontend,parentPid:999},owner,server],[hook,frontend,{...owner,startedAt:'2026-11-03T01:00:02.500Z'},server],[hook,frontend,owner,{...server,startedAt:'2026-11-03T01:00:00.500Z'}],[{...hook,parentPid:101},frontend,owner,server]])assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>processes})),/owner|ancestor|incarnation|process|frontend|origin/i);
});
test('a shared daemon carrying a live other owner origin is rejected',()=>{
 assert.equal(typeof api.verifyHost,'function','host proof verification is missing');
 const daemon={pid:501,parentPid:1,name:'codex.exe',startedAt:'2026-11-03T00:00:00.000Z'};
 assert.throws(()=>api.verifyHost({origin,owner,server,window:'@1',frontend},'hook',deps({processes:()=>[{...hook,parentPid:501},daemon,frontend,owner,server]})),/ancestor|origin|owner|frontend/i);
});
test('a daemon below another still-live frontend cannot prove the second frontend origin',()=>{
 const daemon={pid:501,parentPid:301,name:'codex.exe',startedAt:'2026-11-03T01:00:02.500Z'},proof={origin,owner,server,window:'@1',frontend};
 assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>[{...hook,parentPid:501},daemon,frontend,owner,server]})),/frontend|ambiguous|daemon/i);
});
test('a sibling Codex process cannot replace the explicitly registered frontend',()=>{
 const sibling={...frontend,pid:601};assert.throws(()=>api.verifyHost({origin,owner,server,window:'@1',frontend},'hook',deps({processes:()=>[{...hook,parentPid:601},frontend,sibling,owner,server]})),/frontend|origin|ancestor/i);
});

test('a registered local App Server proves its own hook chain without pretending to be the sibling TUI',()=>{
 const app={pid:501,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.100Z'},remote={...hook,parentPid:501},proof={origin,owner,server,window:'@1',frontend,appServer:{endpoint:'ws://127.0.0.1:12345/',process:app}};
 assert.deepEqual(api.verifyHost(proof,'hook',deps({processes:()=>[remote,app,frontend,owner,server]})),proof);
 for(const changed of [{...app,parentPid:999},{...app,startedAt:'2026-11-03T01:00:02.200Z'},{...app,name:'other.exe'}])assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>[remote,changed,frontend,owner,server]})),/server|incarnation|origin|process/i);
 assert.throws(()=>api.verifyHost(proof,'hook',deps()),/server|origin|process/i);
 assert.throws(()=>api.verifyHost({...proof,appServer:{...proof.appServer,endpoint:'ws://example.com:12345'}},'hook',deps({processes:()=>[remote,app,frontend,owner,server]})),/endpoint|loopback|server/i);
});

test('local-server mode still rejects foreign hooks and loss of its actual frontend',()=>{
 const app={pid:501,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.100Z'},foreign={...app,pid:601},proof={origin,owner,server,window:'@1',frontend,appServer:{endpoint:'ws://127.0.0.1:12345/',process:app}};
 assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>[{...hook,parentPid:601},app,foreign,frontend,owner,server]})),/origin|ancestry|server/i);
 assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>[{...hook,parentPid:501},app,owner,server]})),/frontend/i);
});
test('detached split targets the exact pane and returns a scoped pane, never a WT destination',()=>{
 assert.equal(typeof api.PsmuxClient,'function','psmux backend is missing');
 let emitted;
 const client=new api.PsmuxClient(origin,{run:args=>{emitted=args;return '%7\n';}});
 const opened=client.split(4,path.resolve('runtime/launch.json'));
 assert.equal(opened,'%7');assert.deepEqual(emitted.slice(0,12),['-L','mzhud-test','split-window','-v','-d','-t','%1','-l','4','-P','-F','#{pane_id}']);
 assert.ok(emitted.includes('--'));assert.ok(emitted.includes('watch'));assert.ok(!emitted.includes('wt.exe'));assert.ok(!emitted.includes('last'));
 assert.throws(()=>new api.PsmuxClient(origin,{run:()=>'%1'}).split(4,'x'),/source|owner|same pane/i);
 assert.throws(()=>new api.PsmuxClient(origin,{run:()=>'%7\n%8'}).split(4,'x'),/pane/i);
});
test('same pane number from another server cannot satisfy owner proof',()=>{
 assert.equal(typeof api.proveOwner,'function','bootstrap proof is missing');
 const proof=api.proveOwner(origin,deps({pid:201,processes:()=>[owner,server]}));assert.equal(proof.server.pid,101);assert.equal(proof.owner.pid,201);
 assert.throws(()=>api.proveOwner(origin,deps({pid:201,processes:()=>[owner,server],run:()=>pane.replace(/101$/,'102')})),/server|endpoint/i);
 assert.throws(()=>api.proveOwner(origin,deps({pid:999,processes:()=>[owner,server]})),/owner|process/i);
});
test('an existing process with unreadable birth time is unknown rather than dead',{skip:process.platform!=='win32'},()=>{
 const helper=path.resolve(import.meta.dirname,'../bin/process-facts.ps1').replaceAll("'","''"),script=`function New-Object { $entry=[pscustomobject]@{ProcessId=123;ParentProcessId=1;Name='node.exe';CreationDate=$null}; $entry | Add-Member ScriptMethod Dispose {}; $snapshot=[System.Collections.ArrayList]@($entry); Add-Member -InputObject $snapshot ScriptMethod Dispose {}; $searcher=[pscustomobject]@{Snapshot=$snapshot}; $searcher | Add-Member ScriptMethod Get { ,$this.Snapshot }; $searcher | Add-Member ScriptMethod Dispose {}; return $searcher }; & '${helper}' -RootPid 123 -Ids '123' -IdentitiesOnly`;
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:10000});assert.notEqual(result.status,0,'a live process with unknown identity must not disappear from the snapshot');assert.match(result.stderr,/unknown creation time/);
});

test('explicit identity collection preserves creation times without CIM initialization or inferred ancestry',{skip:process.platform!=='win32'},()=>{
 const helper=path.resolve(import.meta.dirname,'../bin/process-facts.ps1').replaceAll("'","''");
 const script=`$expected=Get-CimInstance -Query "SELECT CreationDate FROM Win32_Process WHERE ProcessId=$PID"; function Get-CimInstance { throw 'CIM cmdlet initialization is not available' }; $raw=& '${helper}' -RootPid $PID -Ids '${process.pid}' -IdentitiesOnly; [pscustomobject]@{root=$PID;expected=$expected.CreationDate.ToUniversalTime().ToString('O');raw=$raw} | ConvertTo-Json -Compress`;
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);const {root,expected,raw}=JSON.parse(result.stdout.replace(/^\uFEFF/,'')),facts=JSON.parse(raw);
 const self=facts.find(p=>p.pid===root),parent=facts.find(p=>p.pid===process.pid);
 assert.equal(self.parentPid,process.pid);assert.equal(self.name.toLowerCase(),'powershell.exe');assert.equal(self.startedAt,expected);
 assert.equal(parent.name.toLowerCase(),'node.exe');assert.equal(new Set(facts.map(p=>p.pid)).size,facts.length);
 assert.equal(facts.length,2,'explicit identity lookup does not return or imply an ancestor proof');
});

test('periodic identity queries keep the actual caller and only explicitly requested processes',{skip:process.platform!=='win32'},()=>{
 assert.equal(typeof api.readProcessIdentities,'function');
 const facts=api.readProcessIdentities([process.pid]);assert.equal(facts.length,1);assert.equal(facts[0].pid,process.pid);assert.equal(facts[0].name.toLowerCase(),'node.exe');
 const ancestry=api.readProcessFacts([process.pid]);assert.ok(ancestry.some(p=>p.pid===facts[0].parentPid));
 assert.deepEqual(ancestry.find(p=>p.pid===process.pid),facts[0]);
});
