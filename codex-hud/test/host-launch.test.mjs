import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const api=await import('../dist/host-launch.js').catch(()=>({}));
const cli=path.resolve(import.meta.dirname,'../bin/hud.mjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-launch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const pkg=path.join(root,'node_modules/@openai/codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'},type:'module'}));fs.writeFileSync(path.join(pkg,'bin/codex.js'),"import fs from 'node:fs';const input=fs.readFileSync(0,'utf8');console.log(JSON.stringify({args:process.argv.slice(2),input}));process.exitCode=17;");const command=path.join(root,'codex.ps1');fs.writeFileSync(command,'# npm shim fixture');return {root,command};}
test('only interactive Codex invocations are routed into a terminal host',()=>{
 assert.equal(typeof api.classifyCodexInvocation,'function','transparent CLI routing is missing');
 for(const args of [[],['resume'],['fork','id'],['-m','sample','resume','id'],['--','exec'],['a normal prompt'],['-c','model="exec"']])assert.equal(api.classifyCodexInvocation(args),'interactive',JSON.stringify(args));
 for(const args of [['--version'],['--help'],['resume','--help'],['exec','hello'],['e','hello'],['plugin','list'],['login'],['app-server'],['queue','id','message'],['-m','sample','review'],['help','resume']])assert.equal(api.classifyCodexInvocation(args),'passthrough',JSON.stringify(args));
 assert.throws(()=>api.classifyCodexInvocation(['--remote','ws://localhost:1234']),/remote|origin/i);
});
test('non-TTY entry preserves literal arguments, pipeline input and official exit status',t=>{
 const f=fixture(t),args=['exec','space value','中文','"quoted"','; & $(no execution)','`literal`','$HOME','',"single'quote",'back\\slash\\'];
 const encoded=Buffer.from(JSON.stringify({command:f.command,args})).toString('base64');
 const result=spawnSync(process.execPath,[cli,'codex-entry','--invocation64',encoded],{encoding:'utf8',input:'pipeline payload\n',env:{...process.env,LOCALAPPDATA:f.root}});
 assert.equal(result.status,17,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{args,input:'pipeline payload\n'});
 const stored=fs.readdirSync(f.root).filter(n=>!['node_modules','codex.ps1'].includes(n));assert.deepEqual(stored,[],'passthrough must not create host state');
});
for(const shell of ['pwsh.exe','powershell.exe'])test('PowerShell entry preserves literal argv and pipeline through '+shell,{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),entry=path.resolve(import.meta.dirname,'../bin/powershell-entry.ps1'),runner=path.join(f.root,'run.ps1'),args=['exec','中文','"quoted"','; $(no execution)','',"single'quote"];
 const args64=Buffer.from(JSON.stringify(args)).toString('base64'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 fs.writeFileSync(runner,`. ${quote(entry)} -HudCli ${quote(cli)} -NodePath ${quote(process.execPath)}\n$values=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${args64}')))\n'pipeline' | codex @values\nexit $LASTEXITCODE\n`);
 const result=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{env:{...process.env,PATH:f.root+path.delimiter+process.env.PATH,LOCALAPPDATA:f.root},encoding:'utf8',timeout:15000});
 assert.equal(result.status,17,result.stderr);const value=JSON.parse(result.stdout);assert.deepEqual(value.args,args);assert.match(value.input,/pipeline/);
});
test('reloading the entry refuses a user replacement of its codex function',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),entry=path.resolve(import.meta.dirname,'../bin/powershell-entry.ps1'),runner=path.join(f.root,'conflict.ps1'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 fs.writeFileSync(runner,`. ${quote(entry)} -HudCli ${quote(cli)} -NodePath ${quote(process.execPath)}\nfunction global:codex { 'USER-OWNED' }\ntry { . ${quote(entry)} -HudCli ${quote(cli)} -NodePath ${quote(process.execPath)};exit 9 } catch { codex;exit 0 }\n`);
 const result=spawnSync('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',env:{...process.env,PATH:f.root+path.delimiter+process.env.PATH},timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/USER-OWNED/);
});
test('loading the entry preserves the calling PowerShell error preference',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),entry=path.resolve(import.meta.dirname,'../bin/powershell-entry.ps1'),runner=path.join(f.root,'preference.ps1'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 fs.writeFileSync(runner,`$ErrorActionPreference='Continue'\n. ${quote(entry)} -HudCli ${quote(cli)} -NodePath ${quote(process.execPath)}\nWrite-Output $ErrorActionPreference\n`);
 const result=spawnSync('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',env:{...process.env,PATH:f.root+path.delimiter+process.env.PATH},timeout:10000});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'Continue');
});
