import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
const api=await import('../dist/entry-install.js').catch(()=>({}));
test('a retained old cache cannot silently remain the PowerShell entry after an upgrade',t=>{
 assert.equal(typeof api.assertActiveEntry,'function','active plugin authority check is missing');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hud-entry-authority-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud');
 for(const version of ['0.4.0','0.4.1'])fs.mkdirSync(path.join(base,version,'bin'),{recursive:true});
 assert.throws(()=>api.assertActiveEntry(path.join(base,'0.4.0/bin/hud.mjs'),home),/obsolete|active|upgrade/i);
 assert.doesNotThrow(()=>api.assertActiveEntry(path.join(base,'0.4.1/bin/hud.mjs'),home));
 fs.mkdirSync(path.join(base,'local/bin'),{recursive:true});assert.throws(()=>api.assertActiveEntry(path.join(base,'0.4.1/bin/hud.mjs'),home),/obsolete|active/i);assert.doesNotThrow(()=>api.assertActiveEntry(path.join(base,'local/bin/hud.mjs'),home));
});
test('cache version order follows semver and local override instead of lexical recency',t=>{
 assert.equal(typeof api.assertActiveEntry,'function','active plugin authority check is missing');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hud-entry-semver-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud');
 for(const version of ['0.9.0','0.10.0-rc.2','0.10.0-rc.11','0.10.0'])fs.mkdirSync(path.join(base,version,'bin'),{recursive:true});
 assert.doesNotThrow(()=>api.assertActiveEntry(path.join(base,'0.10.0/bin/hud.mjs'),home));assert.throws(()=>api.assertActiveEntry(path.join(base,'0.9.0/bin/hud.mjs'),home));
});
test('an already loaded PowerShell entry refuses a cache upgrade before invoking old code',{skip:process.platform!=='win32'},t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hud-loaded-upgrade-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const home=path.join(tmp,'home'),base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud'),installed=path.join(base,'0.4.0'),source=path.resolve(import.meta.dirname,'..');
 fs.cpSync(source,installed,{recursive:true,filter:file=>!['node_modules','src','test','scripts'].includes(path.relative(source,file).split(path.sep)[0])});
 const npm=path.join(tmp,'npm'),pkg=path.join(npm,'node_modules/@openai/codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(npm,'codex.ps1'),'# synthetic npm shim');fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'}}));fs.writeFileSync(path.join(pkg,'bin/codex.js'),"console.log('MUST-NOT-RUN-OBSOLETE');");
 const quote=s=>"'"+s.replaceAll("'","''")+"'",runner=path.join(tmp,'run.ps1');fs.writeFileSync(runner,`. ${quote(path.join(installed,'bin/powershell-entry.ps1'))} -HudCli ${quote(path.join(installed,'bin/hud.mjs'))} -NodePath ${quote(process.execPath)}\nNew-Item -ItemType Directory -Path ${quote(path.join(base,'0.4.1'))} | Out-Null\ncodex --version\nexit $LASTEXITCODE\n`);
 const result=spawnSync('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',timeout:15000,env:{...process.env,CODEX_HOME:home,PATH:npm+path.delimiter+process.env.PATH,LOCALAPPDATA:tmp}});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/obsolete|active installed/i);assert.ok(!result.stdout.includes('MUST-NOT-RUN-OBSOLETE'));
});
