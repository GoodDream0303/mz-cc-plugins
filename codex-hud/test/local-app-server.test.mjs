import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';
const api=await import('../dist/local-app-server.js').catch(()=>({}));
test('managed npm server resolves the owned native binary rather than a wrapper with an orphanable child',t=>{
 assert.equal(typeof api.resolveOfficialExecutable,'function');const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-server-entry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pkg=path.join(root,'node_modules/@openai/codex'),platform=path.join(pkg,'node_modules/@openai/codex-win32-x64');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'}}));fs.writeFileSync(path.join(pkg,'bin/codex.js'),'');fs.writeFileSync(path.join(root,'codex.ps1'),'# npm shim');fs.mkdirSync(platform,{recursive:true});fs.writeFileSync(path.join(platform,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.0.0-win32-x64'}));const exe=path.join(platform,'vendor/x86_64-pc-windows-msvc/bin/codex.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'native fixture');
 assert.equal(api.resolveOfficialExecutable(path.join(root,'codex.ps1')),fs.realpathSync(exe));assert.equal(api.resolveOfficialExecutable(exe),fs.realpathSync(exe));fs.unlinkSync(exe);assert.throws(()=>api.resolveOfficialExecutable(path.join(root,'codex.ps1')),/native|executable/i);
});
test('managed startup forwards supported config overrides and refuses unsupported profiles before launching a TUI',()=>{
 assert.equal(typeof api.localAppServerStartup,'function');const result=api.localAppServerStartup(['-c','mcp_servers.docs.enabled=false','--enable','sample','--strict-config','resume','thread-a']);assert.deepEqual(result.args,['-c','mcp_servers.docs.enabled=false','--enable','sample','--strict-config']);
 assert.throws(()=>api.localAppServerStartup(['--profile','other']),/profile/i);assert.throws(()=>api.localAppServerStartup(['--no-daemon']),/no-daemon/i);
});
test('remote TUI arguments preserve literal user arguments and contain an environment name without its credential',()=>{
 assert.equal(typeof api.remoteInvocation,'function');const original={command:path.resolve('codex.exe'),args:['resume','thread-a','--','space value','$(literal)','中文']},changed=api.remoteInvocation(original,'ws://127.0.0.1:12345');
 assert.deepEqual(changed.args,['--remote','ws://127.0.0.1:12345','--remote-auth-token-env','MZ_HUD_APP_SERVER_TOKEN',...original.args]);assert.deepEqual(original.args,['resume','thread-a','--','space value','$(literal)','中文']);
});
test('native listener lookup returns the actual loopback owning process',{skip:process.platform!=='win32'},async t=>{
 assert.equal(typeof api.readLoopbackListener,'function');const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>listener.close(r)));assert.equal(api.readLoopbackListener(listener.address().port),process.pid);
});
