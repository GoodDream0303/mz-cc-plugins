import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const api=await import('../dist/entry-resolver.js').catch(()=>({}));
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hud-active-entry-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud');
 for(const version of ['0.5.0','0.6.0','9.0.0']){const root=path.join(base,version);fs.mkdirSync(path.join(root,'bin'),{recursive:true});fs.mkdirSync(path.join(root,'.codex-plugin'));fs.mkdirSync(path.join(root,'dist'));fs.writeFileSync(path.join(root,'bin/hud.mjs'),'');fs.writeFileSync(path.join(root,'dist/cli.js'),'');fs.writeFileSync(path.join(root,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-hud',version}));}
 return {home,base,hint:path.join(base,'0.5.0/bin/hud.mjs'),active:path.join(base,'0.6.0/bin/hud.mjs'),record:{pluginId:'codex-hud@mz-cc-plugins',name:'codex-hud',marketplaceName:'mz-cc-plugins',version:'0.6.0',installed:true,enabled:true}};
}
test('actual installed version wins over higher residual caches and directory recency',t=>{
 assert.equal(typeof api.selectInstalledEntry,'function','installed plugin resolver is missing');const f=fixture(t);
 assert.equal(api.selectInstalledEntry({installed:[f.record],available:[]},f.hint,f.home),f.active);
 fs.rmSync(path.dirname(path.dirname(f.hint)),{recursive:true});
 assert.equal(api.selectInstalledEntry({installed:[f.record]},f.hint,f.home),f.active,'hint must survive deletion of the old cache');
});
test('disabled missing ambiguous or malformed installation is never replaced by a residual cache',t=>{
 assert.equal(typeof api.selectInstalledEntry,'function','installed plugin resolver is missing');const f=fixture(t);
 for(const installed of [[],[{...f.record,enabled:false}],[{...f.record,installed:false}],[f.record,f.record],[{...f.record,version:'../other'}],[{...f.record,pluginId:'codex-hud@other-market'}]])assert.throws(()=>api.selectInstalledEntry({installed},f.hint,f.home));
 assert.throws(()=>api.selectInstalledEntry({available:[f.record]},f.hint,f.home));
 fs.writeFileSync(path.join(f.base,'0.6.0/.codex-plugin/plugin.json'),JSON.stringify({name:'different-plugin',version:'0.6.0'}));
 assert.throws(()=>api.selectInstalledEntry({installed:[f.record]},f.hint,f.home),/identity|manifest|package/i);
});
test('cached hints from another home cannot become implicit development checkouts',t=>{
 assert.equal(typeof api.selectInstalledEntry,'function','installed plugin resolver is missing');const f=fixture(t);
 assert.throws(()=>api.selectInstalledEntry({installed:[f.record]},f.hint,path.join(f.home,'other-home')),/home|cache/i);
});
