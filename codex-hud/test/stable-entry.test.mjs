import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
const profiles=await import('../dist/profile-setup.js');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-stable-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'),base=path.join(home,'plugins/cache/mz-cc-plugins/codex-hud'),official=path.join(root,'official'),pkg=path.join(official,'node_modules/@openai/codex');
 fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'},type:'module'}));
 const state=path.join(root,'installed.json'),record={pluginId:'codex-hud@mz-cc-plugins',name:'codex-hud',marketplaceName:'mz-cc-plugins',version:'0.5.0',installed:true,enabled:true};
 fs.writeFileSync(state,JSON.stringify({installed:[record]}));
 fs.writeFileSync(path.join(pkg,'bin/codex.js'),`import fs from 'node:fs';if(process.argv.slice(2).join(' ')==='plugin list --json'){console.log(fs.readFileSync(${JSON.stringify(state)},'utf8'));}else{console.log(JSON.stringify({version:'official',args:process.argv.slice(2),input:fs.readFileSync(0,'utf8')}));process.exitCode=17;}`);
 // A working official shim is required when the independent resolver is absent.
 fs.writeFileSync(path.join(official,'codex.ps1'),`$input | & ${quote(process.execPath)} ${quote(path.join(pkg,'bin/codex.js'))} @args\n`);
 for(const version of ['0.5.0','0.6.0']){
  const at=path.join(base,version);fs.mkdirSync(path.join(at,'bin'),{recursive:true});fs.mkdirSync(path.join(at,'dist'));fs.mkdirSync(path.join(at,'.codex-plugin'));
  fs.writeFileSync(path.join(at,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-hud',version}));fs.writeFileSync(path.join(at,'dist/cli.js'),'export const ready=true;');fs.writeFileSync(path.join(at,'package.json'),'{"type":"module"}');
  fs.writeFileSync(path.join(at,'bin/hud.mjs'),`import fs from 'node:fs';const r=JSON.parse(Buffer.from(process.argv[process.argv.indexOf('--invocation64')+1],'base64'));console.log(JSON.stringify({version:${JSON.stringify(version)},args:r.args,input:fs.readFileSync(0,'utf8')}));process.exitCode=17;`);
 }
 const config=path.join(root,'settings/config.json'),profile=path.join(root,'profile.ps1'),options={entry:path.resolve('bin/powershell-entry.ps1'),cli:path.join(base,'0.5.0/bin/hud.mjs'),node:process.execPath,configFile:config};
 return {root,home,base,state,record,official,profile,options};
}
function prepare(f){const plan=profiles.stableEntryPlan(f.options,f.home);profiles.applyStableEntry(plan);profiles.applyProfileChange(profiles.profileChange(f.profile,plan.loader));return plan;}
function run(f,shell,script){
 const runner=path.join(f.root,'run.ps1');fs.writeFileSync(runner,script);
 const env={...process.env,CODEX_HOME:f.home,LOCALAPPDATA:f.root,PATH:f.official+path.delimiter+process.env.PATH};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
 return spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',runner],{env,encoding:'utf8',timeout:25000});
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
 assert.equal(result.status,17,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.version,'official');assert.deepEqual(value.args,args);assert.match(value.input,/payload/);
 fs.writeFileSync(f.state,JSON.stringify({installed:[f.record]}));fs.writeFileSync(path.join(f.base,'0.5.0/dist/cli.js'),'throw new Error("broken package");');
 const damaged=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex resume id\nexit $LASTEXITCODE\n`);assert.equal(damaged.status,17,damaged.stderr);assert.equal(JSON.parse(damaged.stdout).version,'official');
});
test('deleted bootstrap leaves the official command available after profile load',{skip:process.platform!=='win32'},t=>{
 assert.equal(typeof profiles.stableEntryPlan,'function','stable entry setup is missing');const f=fixture(t),plan=prepare(f);fs.unlinkSync(plan.loader.entry);
 const result=run(f,'pwsh.exe',`. ${quote(f.profile)}\n'data' | codex --version\nexit $LASTEXITCODE\n`);assert.equal(result.status,17,result.stderr);assert.equal(JSON.parse(result.stdout).version,'official');
});
