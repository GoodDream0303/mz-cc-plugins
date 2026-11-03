import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const api=await import('../dist/profile-setup.js').catch(()=>({}));
function fixture(t,content){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-profile-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'profile.ps1');if(content!==undefined)fs.writeFileSync(file,content);return {root,file};}
const options={entry:path.resolve('plugin space 中文/bin/powershell-entry.ps1'),cli:path.resolve('plugin space 中文/bin/hud.mjs'),node:process.execPath};
test('setup is a concrete dry-run until explicitly applied and preserves unrelated profile bytes',t=>{
 assert.equal(typeof api.profileChange,'function','profile setup planning is missing');
 const content="# user owns this\r\n$custom='preserve me'",f=fixture(t,content),change=api.profileChange(f.file,options);
 assert.equal(fs.readFileSync(f.file,'utf8'),content);assert.ok(change.after.startsWith(content));assert.ok(change.after.includes('mz-codex-hud'));assert.ok(!change.after.includes('中文'),'ASCII loader supports PS5 UTF-8 parsing');
 api.applyProfileChange(change);const installed=fs.readFileSync(f.file,'utf8');assert.equal(installed,change.after);
 assert.equal(api.profileChange(f.file,options).after,installed,'setup must be idempotent');
 api.applyProfileChange(api.profileChange(f.file,options,'remove'));assert.equal(fs.readFileSync(f.file,'utf8'),content);
});
test('setup refuses edited managed blocks and a stale proposed file change',t=>{
 assert.equal(typeof api.profileChange,'function','profile setup planning is missing');
 const f=fixture(t,'# original\n'),change=api.profileChange(f.file,options);fs.appendFileSync(f.file,'# concurrent user edit\n');assert.throws(()=>api.applyProfileChange(change),/changed|stale|concurrent/i);
 const fresh=api.profileChange(f.file,options);api.applyProfileChange(fresh);fs.writeFileSync(f.file,fs.readFileSync(f.file,'utf8').replace(/FromBase64String/,'UNREVIEWED'));
 assert.throws(()=>api.profileChange(f.file,options,'remove'),/modified|edited|checksum/i);
});
test('setup handles a new profile and UTF-16 profiles without changing their encoding',t=>{
 assert.equal(typeof api.profileChange,'function','profile setup planning is missing');
 const fresh=fixture(t);api.applyProfileChange(api.profileChange(fresh.file,options));assert.ok(fs.existsSync(fresh.file));
 const content='\uFEFF# 用户配置\r\n',other=fixture(t,Buffer.from(content,'utf16le'));api.applyProfileChange(api.profileChange(other.file,options));api.applyProfileChange(api.profileChange(other.file,options,'remove'));assert.deepEqual(fs.readFileSync(other.file),Buffer.from(content,'utf16le'));
});
test('removing a managed block retains user commands appended after installation',t=>{
 const f=fixture(t,"$original='keep'");api.applyProfileChange(api.profileChange(f.file,options));fs.appendFileSync(f.file,"$later='also keep'\n");
 api.applyProfileChange(api.profileChange(f.file,options,'remove'));assert.equal(fs.readFileSync(f.file,'utf8'),"$original='keep'\n$later='also keep'\n");
});
test('profile markers must occupy whole lines so commented suffixes never become executable',t=>{
 for(const suffix of [' Write-Output USER-TEXT',' # user comment']){
  const f=fixture(t,'# original\n'),change=api.profileChange(f.file,options);fs.writeFileSync(f.file,change.after.replace('# <<< mz-codex-hud <<<','# <<< mz-codex-hud <<<'+suffix));
  assert.throws(()=>api.profileChange(f.file,options,'remove'),/marker|modified|edited/i);assert.throws(()=>api.profileChange(f.file,options),/marker|modified|edited/i);
 }
});
