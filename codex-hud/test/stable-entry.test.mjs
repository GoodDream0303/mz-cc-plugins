import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
const profiles=await import('../dist/profile-setup.js');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-stable-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const home=path.join(root,'home'),base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud'),official=path.join(root,'official'),pkg=path.join(official,'node_modules/@openai/codex');
 fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'},type:'module'}));
 const state=path.join(root,'installed.json'),record={pluginId:'codex-hud@mz-cc-plugins',name:'codex-hud',marketplaceName:'mz-cc-plugins',version:'0.5.0',installed:true,enabled:true};
 fs.writeFileSync(state,JSON.stringify({installed:[record]}));
 fs.writeFileSync(path.join(pkg,'bin/codex.js'),`import fs from 'node:fs';if(process.argv[2]==='plugin'&&process.argv[3]==='list'&&process.argv.includes('--json')){console.log(fs.readFileSync(${JSON.stringify(state)},'utf8'));}else{console.log(JSON.stringify({version:'official',args:process.argv.slice(2),input:fs.readFileSync(0,'utf8')}));process.exitCode=17;}`);
 // A working official shim is required when the independent resolver is absent.
 fs.writeFileSync(path.join(official,'codex.ps1'),`$input | & ${quote(process.execPath)} ${quote(path.join(pkg,'bin/codex.js'))} @args\n`);
 for(const version of ['0.5.0','0.6.0']){
  const at=path.join(base,version);fs.mkdirSync(path.join(at,'bin'),{recursive:true});fs.mkdirSync(path.join(at,'dist'));fs.mkdirSync(path.join(at,'.codex-plugin'));
  fs.writeFileSync(path.join(at,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-hud',version}));fs.writeFileSync(path.join(at,'dist/cli.js'),'export const ready=true;');fs.writeFileSync(path.join(at,'package.json'),'{"type":"module"}');
  fs.writeFileSync(path.join(at,'bin/hud.mjs'),`import '../dist/cli.js';import fs from 'node:fs';if(process.argv[2]!=='entry-check'){const r=JSON.parse(Buffer.from(process.argv[process.argv.indexOf('--invocation64')+1],'base64'));console.log(JSON.stringify({version:${JSON.stringify(version)},args:r.args,input:fs.readFileSync(0,'utf8')}));process.exitCode=17;}`);
 }
 const config=path.join(root,'settings/config.json'),profile=path.join(root,'profile.ps1'),options={entry:path.resolve('bin/powershell-entry.ps1'),cli:path.join(base,'0.5.0/bin/hud.mjs'),node:process.execPath,configFile:config};
 return {root,home,base,state,record,official,profile,options};
}
function prepare(f){const plan=profiles.stableEntryPlan(f.options,f.home);profiles.applyStableEntry(plan);profiles.applyProfileChange(profiles.profileChange(f.profile,plan.loader));return plan;}
function run(f,shell,script,overrides={}){
 const runner=path.join(f.root,'run.ps1');fs.writeFileSync(runner,script);
 const env={...process.env,CODEX_HOME:f.home,LOCALAPPDATA:f.root,PATH:f.official+path.delimiter+process.env.PATH};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
 return spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{env:{...env,...overrides},encoding:'utf8',timeout:25000});
}
for(const shell of ['powershell.exe','pwsh.exe'])test('one loaded '+shell+' entry follows upgrade after old cache deletion',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof profiles.stableEntryPlan,'function','stable entry setup is missing');const f=fixture(t);prepare(f);
 assert.ok(!fs.readFileSync(f.profile,'utf8').includes(Buffer.from(f.options.cli).toString('base64')),'profile must not retain a versioned CLI path');
 const result=run(f,shell,`. ${quote(f.profile)}\n'first' | codex resume id\nRemove-Item -LiteralPath ${quote(path.join(f.base,'0.5.0'))} -Recurse -Force\nSet-Content -LiteralPath ${quote(f.state)} -Value '${JSON.stringify({installed:[{...f.record,version:'0.6.0'}]})}' -Encoding UTF8\n'second' | codex resume id\nexit $LASTEXITCODE\n`);
 assert.equal(result.status,17,result.stderr);const values=result.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));assert.deepEqual(values.map(v=>v.version),['0.5.0','0.6.0']);assert.deepEqual(values[1].args,['resume','id']);assert.match(values[1].input,/second/);
});
test('disabled and damaged plugin fall back once with exact arguments and status',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof profiles.stableEntryPlan,'function','stable entry setup is missing');const f=fixture(t);prepare(f);fs.writeFileSync(f.state,JSON.stringify({installed:[{...f.record,enabled:false}]}));
 const args=['resume','space value','','"quoted"','中文','; & $(literal)'],encoded=Buffer.from(JSON.stringify(args)).toString('base64');
 const result=run(f,'powershell.exe',`. ${quote(f.profile)}\n$a=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))\n'payload' | codex @a\nexit $LASTEXITCODE\n`);
 assert.equal(result.status,17,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.version,'official');assert.deepEqual(value.args,args);assert.match(value.input,/payload/);assert.match(result.stderr,/plugin-state:FAILED/);
 fs.writeFileSync(f.state,JSON.stringify({installed:[f.record]}));fs.writeFileSync(path.join(f.base,'0.5.0/dist/cli.js'),'throw new Error("broken package");');
 const damaged=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex resume id\nexit $LASTEXITCODE\n`);assert.equal(damaged.status,17,damaged.stderr);assert.equal(JSON.parse(damaged.stdout).version,'official');assert.match(damaged.stderr,/runtime-check:[A-Z0-9_]+/);
});
test('deleted bootstrap leaves the official command available after profile load',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof profiles.stableEntryPlan,'function','stable entry setup is missing');const f=fixture(t),plan=prepare(f);fs.unlinkSync(plan.loader.entry);
 const result=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex --version\nexit $LASTEXITCODE\n`);assert.equal(result.status,17,result.stderr);assert.equal(JSON.parse(result.stdout).version,'official');
});
test('corrupt or deleted resolver cannot block official Codex or lose PS5 literal arguments',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),plan=prepare(f),resolver=plan.files.find(file=>file.file.endsWith('.mjs')).file;
 const args=['resume','','space value','"quoted"','; & $(literal)'],encoded=Buffer.from(JSON.stringify(args)).toString('base64');
 for(const damaged of [true,false]){
  if(damaged)fs.writeFileSync(resolver,'this is not valid JavaScript');else fs.unlinkSync(resolver);
  const result=run(f,'powershell.exe',`. ${quote(f.profile)}\n$a=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))\n'data' | codex @a\nexit $LASTEXITCODE\n`);
  assert.equal(result.status,17,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{version:'official',args,input:'data\r\n'});
 }
});
test('official install path is discovered again by the same loaded function',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);prepare(f);fs.writeFileSync(f.state,JSON.stringify({installed:[]}));
 const next=path.join(f.root,'new-official');fs.cpSync(f.official,next,{recursive:true});const script=path.join(next,'node_modules/@openai/codex/bin/codex.js');fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace("version:'official'","version:'updated-official'"));
 const result=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'first' | codex --version\n$env:PATH=${quote(next)}+[IO.Path]::PathSeparator+$env:PATH\n'second' | codex --version\nexit $LASTEXITCODE\n`);
 assert.equal(result.status,17,result.stderr);assert.deepEqual(result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line).version),['official','updated-official']);
});
test('loss of Node still allows a native official launcher to run once',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),exe=path.join(f.official,'codex.exe');fs.unlinkSync(path.join(f.official,'codex.ps1'));
 const code='public class OfficialFixture { public static int Main(string[] args) { System.Console.WriteLine("native:"+System.String.Join("|",args)); return 37; } }';
 const compile=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -TypeDefinition ${quote(code)} -OutputAssembly ${quote(exe)} -OutputType ConsoleApplication`],{encoding:'utf8',timeout:15000});assert.equal(compile.status,0,compile.stderr);
 f.options.node=path.join(f.root,'removed-node.exe');prepare(f);
 const win=process.env.SystemRoot??'C:/Windows',shell=path.join(win,'System32/WindowsPowerShell/v1.0/powershell.exe'),safePath=[f.official,path.join(win,'System32'),path.dirname(shell)].join(path.delimiter);
 const result=run(f,shell,`. ${quote(f.profile)}\ncodex resume id\nexit $LASTEXITCODE\n`,{PATH:safePath});assert.equal(result.status,37,result.stderr);assert.equal(result.stdout.trim(),'native:resume|id');assert.match(result.stderr,/without HUD/);
});
test('syntax or startup corruption in the actual HUD entry falls back before official startup',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);prepare(f);const cli=path.join(f.base,'0.5.0/bin/hud.mjs');
 for(const shell of ['powershell.exe','pwsh.exe'])for(const contents of ['invalid JavaScript syntax','throw new Error("broken entry");']){
  fs.writeFileSync(cli,contents);const result=run(f,shell,`. ${quote(f.profile)}\n'data' | codex resume id\nexit $LASTEXITCODE\n`);
  assert.equal(result.status,17,result.stderr);assert.equal(JSON.parse(result.stdout).version,'official');assert.match(result.stderr,/without HUD/);
 }
});
test('ordinary installed-plugin lookup can take more than four seconds without losing HUD',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);prepare(f);const script=path.join(f.official,'node_modules/@openai/codex/bin/codex.js');
 fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace("console.log(fs.readFileSync(","await new Promise(resolve=>setTimeout(resolve,4200));console.log(fs.readFileSync("));
 const result=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex resume id\nexit $LASTEXITCODE\n`);assert.equal(result.status,17,result.stderr);assert.equal(JSON.parse(result.stdout).version,'0.5.0');
});
test('HUD startup queries only its configured marketplace when other markets are slow',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);prepare(f);const script=path.join(f.official,'node_modules/@openai/codex/bin/codex.js');
 fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace("console.log(fs.readFileSync(","if(!process.argv.includes('--marketplace')||process.argv[process.argv.indexOf('--marketplace')+1]!=='mz-cc-plugins'){await new Promise(resolve=>setTimeout(resolve,8500));}console.log(fs.readFileSync("));
 const result=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex resume id\nexit $LASTEXITCODE\n`);assert.equal(result.status,17,result.stderr);assert.equal(JSON.parse(result.stdout).version,'0.5.0');
});
test('real PS5 and PS7 consoles preserve TTY handles through the installed HUD entry',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t);prepare(f);const observed=path.join(f.root,'console.json'),runner=path.join(f.root,'console.ps1');
 fs.writeFileSync(path.join(f.base,'0.5.0/bin/hud.mjs'),`import fs from 'node:fs';if(process.argv[2]!=='entry-check'){fs.writeFileSync(${JSON.stringify(observed)},JSON.stringify({inputTTY:!!process.stdin.isTTY,outputTTY:!!process.stdout.isTTY}));process.exitCode=17;}`);
 fs.writeFileSync(runner,`. ${quote(f.profile)}\ncodex resume fixture\nexit $LASTEXITCODE\n`);
 for(const shell of ['powershell.exe','pwsh.exe']){
  const executable=spawnSync(shell,['-NoLogo','-NoProfile','-Command','(Get-Process -Id $PID).Path'],{encoding:'utf8',timeout:10000});assert.equal(executable.status,0,executable.stderr);
  if(fs.existsSync(observed))fs.unlinkSync(observed);
  const script=`$p=Start-Process -FilePath ${quote(executable.stdout.trim())} -ArgumentList @('-NoLogo','-NoProfile','-File',${quote('"'+runner+'"')}) -WindowStyle Hidden -Wait -PassThru\nexit $p.ExitCode`;
  const env={...process.env,CODEX_HOME:f.home,LOCALAPPDATA:f.root,PATH:f.official+path.delimiter+process.env.PATH};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
  const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',env,timeout:20000});assert.equal(result.status,17,result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(observed,'utf8')),{inputTTY:true,outputTTY:true},shell);
 }
});
