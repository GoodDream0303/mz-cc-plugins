import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const backend=await import('../dist/backend-version.js');
const moduleUrl=pathToFileURL(path.resolve('dist/host-launch.js')).href;
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const pkg=path.join(root,'node_modules/@openai/codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),'{"name":"@openai/codex","bin":{"codex":"bin/codex.js"},"type":"module"}');
 fs.writeFileSync(path.join(pkg,'bin/codex.js'),"import fs from 'node:fs';console.log(JSON.stringify({args:process.argv.slice(2),input:fs.readFileSync(0,'utf8')}));process.exitCode=17;");
 const command=path.join(root,'codex.ps1'),config=path.join(root,'config.json');fs.writeFileSync(command,'# npm shim');return {root,command,config};
}
function run(f){
 const invocation={command:f.command,args:['resume','literal id','',"'quoted'",'中文']};
 const code=`import {launchHostedCodex} from ${JSON.stringify(moduleUrl)};process.exitCode=await launchHostedCodex(${JSON.stringify(invocation)},{interactive:true,configFile:${JSON.stringify(f.config)}});`;
 const env={...process.env,LOCALAPPDATA:f.root};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
 return spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',input:'payload\n',env,timeout:15000});
}
test('damaged configuration and missing backend start official Codex once with original arguments',t=>{
 const f=fixture(t);
 for(const content of ['{broken',JSON.stringify({host:{autoStart:'enabled',psmuxPath:path.join(f.root,'missing.exe')}})]){
  fs.writeFileSync(f.config,content);const result=run(f);assert.equal(result.status,17,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{args:['resume','literal id','',"'quoted'",'中文'],input:'payload\n'});assert.match(result.stderr,/without HUD/i);
 }
});
test('old package backend paths follow the current bundled backend while custom paths stay explicit',t=>{
 assert.equal(typeof backend.effectiveBackendPath,'function','backend upgrade resolution is missing');const f=fixture(t),home=path.join(f.root,'home');
 assert.equal(backend.effectiveBackendPath(path.join(home,'plugins/cache/mz-cc-plugins/codex-hud/0.4.0/backend/psmux.exe'),home),backend.packagedBackendPath());
 const custom=path.join(f.root,'tools/psmux.exe');assert.equal(backend.effectiveBackendPath(custom,home),custom);
 assert.equal(backend.effectiveBackendPath(path.join(home,'plugins/cache/other-plugin/0.4.0/backend/psmux.exe'),home),path.join(home,'plugins/cache/other-plugin/0.4.0/backend/psmux.exe'));
});
test('a backend that may have started Codex is never retried as a second session',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),exe=path.join(f.root,'backend.exe'),marker=path.join(f.root,'backend.txt'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 const csharp=`public class HudBackend { public static int Main(string[] args) { if(args.Length==1 && args[0]=="-V") { System.Console.WriteLine("psmux 3.4.0 (20aa1d7 fixture)"); return 0; } System.IO.File.AppendAllText(${JSON.stringify(marker)},"started\\n"); return 23; } }`;
 const compile=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -TypeDefinition ${quote(csharp)} -OutputAssembly ${quote(exe)} -OutputType ConsoleApplication`],{encoding:'utf8',timeout:15000});assert.equal(compile.status,0,compile.stderr);
 fs.writeFileSync(f.config,JSON.stringify({host:{autoStart:'enabled',psmuxPath:exe}}));const result=run(f);
 assert.equal(result.status,23,result.stderr);assert.equal(result.stdout,'');assert.equal(fs.readFileSync(marker,'utf8'),'started\n');assert.ok(!result.stderr.includes('without HUD'));
});
