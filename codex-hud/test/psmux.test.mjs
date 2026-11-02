import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
 const proof={origin,owner,server,window:'@1'};
 assert.deepEqual(api.verifyHost(proof,'hook',deps()),proof);
 for(const processes of [[hook,{...frontend,parentPid:999},owner,server],[hook,frontend,{...owner,startedAt:'2026-11-03T01:00:02.500Z'},server],[hook,frontend,owner,{...server,startedAt:'2026-11-03T01:00:00.500Z'}],[{...hook,parentPid:101},frontend,owner,server]])assert.throws(()=>api.verifyHost(proof,'hook',deps({processes:()=>processes})),/owner|ancestor|incarnation|process/i);
});
test('a shared daemon carrying a live other owner origin is rejected',()=>{
 assert.equal(typeof api.verifyHost,'function','host proof verification is missing');
 const daemon={pid:501,parentPid:1,name:'codex.exe',startedAt:'2026-11-03T00:00:00.000Z'};
 assert.throws(()=>api.verifyHost({origin,owner,server,window:'@1'},'hook',deps({processes:()=>[{...hook,parentPid:501},daemon,frontend,owner,server]})),/ancestor|origin|owner/i);
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
