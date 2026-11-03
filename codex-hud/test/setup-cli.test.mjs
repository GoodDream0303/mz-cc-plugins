import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..'),cli=path.join(root,'bin/hud.mjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hud-first-run-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,profile:path.join(dir,'profile.ps1'),config:path.join(dir,'config.json')};}
test('first-run preview reports concrete configuration and missing prerequisites without writing',t=>{
 const f=fixture(t),backend=path.join(f.dir,'missing','psmux.exe');
 const result=spawnSync(process.execPath,[cli,'setup','--profile',f.profile,'--psmux',backend,'--enable','--config',f.config],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);
 assert.equal(report.mode,'initialize');assert.equal(report.applied,false);assert.equal(report.readiness.ready,false);
 assert.equal(report.configChanges['host.psmuxPath'].after,backend);assert.equal(report.configChanges['host.autoStart'].after,'enabled');assert.equal(report.configChanges['startup.enabled'].after,false);
 assert.ok(!fs.existsSync(f.profile));assert.ok(!fs.existsSync(f.config));
});
test('first-run apply refuses missing backend before creating either profile or configuration',t=>{
 const f=fixture(t);fs.writeFileSync(f.profile,'# user profile\n');fs.writeFileSync(f.config,'{"language":"zh-Hans","future":{"keep":true}}\n');const originalProfile=fs.readFileSync(f.profile),originalConfig=fs.readFileSync(f.config);
 const result=spawnSync(process.execPath,[cli,'setup','--profile',f.profile,'--psmux',path.join(f.dir,'missing.exe'),'--enable','--apply','--config',f.config],{encoding:'utf8'});
 assert.notEqual(result.status,0);const report=JSON.parse(result.stdout);assert.equal(report.applied,false);assert.equal(report.readiness.ready,false);
 assert.deepEqual(fs.readFileSync(f.profile),originalProfile);assert.deepEqual(fs.readFileSync(f.config),originalConfig);assert.ok(!fs.existsSync(f.profile+'.mz-hud.bak'));assert.ok(!fs.existsSync(f.config+'.bak'));
});
test('PowerShell setup explains missing Node before invoking JavaScript',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),script=path.join(root,'bin/setup.ps1');assert.ok(fs.existsSync(script),'PowerShell-first setup entry is missing');
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-ProfilePath',f.profile,'-NodePath',path.join(f.dir,'missing-node.exe')],{encoding:'utf8',timeout:10000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Node\.js 20|Node.*required/i);assert.ok(!fs.existsSync(f.profile));
});

test('profile removal remains available when the HUD configuration is damaged',t=>{
 const f=fixture(t);const add=spawnSync(process.execPath,[cli,'setup','--profile',f.profile,'--apply','--config',f.config],{encoding:'utf8'});assert.equal(add.status,0,add.stderr);
 fs.writeFileSync(f.config,'{damaged');
 const remove=spawnSync(process.execPath,[cli,'setup','--profile',f.profile,'--remove','--apply','--config',f.config],{encoding:'utf8'});
 assert.equal(remove.status,0,remove.stderr);assert.ok(!fs.readFileSync(f.profile,'utf8').includes('mz-codex-hud'));assert.equal(fs.readFileSync(f.config,'utf8'),'{damaged');
});

test('packaged first-run setup prepares isolated PS5 and PS7 profiles with verified fixture prerequisites',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),installed=path.join(f.dir,'plugin');
 fs.cpSync(root,installed,{recursive:true,filter:file=>!['node_modules','src','test','scripts'].includes(path.relative(root,file).split(path.sep)[0])});
 const pkg=path.join(f.dir,'node_modules/@openai/codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'}}));fs.writeFileSync(path.join(pkg,'bin/codex.js'),"throw Error('Official fixture must not be launched by setup');");fs.writeFileSync(path.join(f.dir,'codex.ps1'),'# official npm shim fixture\n');
 const backend=path.join(f.dir,'psmux.exe'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 const compile=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -TypeDefinition 'public class HudBackendFixture { public static void Main() { System.Console.WriteLine("psmux 3.4.0 (20aa1d7 fixture)"); } }' -OutputAssembly ${quote(backend)} -OutputType ConsoleApplication`],{encoding:'utf8',timeout:15000});
 assert.equal(compile.status,0,compile.stderr);
 for(const shell of ['powershell.exe','pwsh.exe']){
  const profile=path.join(f.dir,shell+'.profile.ps1'),config=path.join(f.dir,shell+'.config.json');
  const result=spawnSync(shell,['-NoProfile','-NonInteractive','-File',path.join(installed,'bin/setup.ps1'),'-ProfilePath',profile,'-PsmuxPath',backend,'-NodePath',process.execPath,'-ConfigPath',config,'-Enable','-Apply'],{encoding:'utf8',env:{...process.env,PATH:f.dir+path.delimiter+process.env.PATH},timeout:15000});
  assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.mode,'initialize');assert.equal(report.applied,true);assert.equal(report.readiness.ready,true);assert.equal(report.readiness.hookTrust,'unknown');
  const saved=JSON.parse(fs.readFileSync(config,'utf8'));assert.equal(saved.startup.enabled,false);assert.equal(saved.host.autoStart,'enabled');assert.equal(saved.host.psmuxPath,backend);assert.ok(fs.readFileSync(profile,'utf8').includes('mz-codex-hud'));
 }
});

test('fresh package initializes with its bundled backend without a compiler or explicit backend path',{skip:process.platform!=='win32'},t=>{
 const f=fixture(t),installed=path.join(f.dir,'plugin');
 fs.cpSync(root,installed,{recursive:true,filter:file=>!['node_modules','src','test','scripts'].includes(path.relative(root,file).split(path.sep)[0])});
 const pkg=path.join(f.dir,'node_modules/@openai/codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'}}));fs.writeFileSync(path.join(pkg,'bin/codex.js'),"throw Error('Setup must not launch the official fixture');");fs.writeFileSync(path.join(f.dir,'codex.ps1'),'# synthetic npm shim');
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(installed,'bin/setup.ps1'),'-ProfilePath',f.profile,'-NodePath',process.execPath,'-ConfigPath',f.config,'-Enable','-Apply'],{encoding:'utf8',env:{...process.env,PATH:f.dir+path.delimiter+process.env.PATH},timeout:15000});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.applied,true);assert.equal(report.readiness.ready,true);
 const config=JSON.parse(fs.readFileSync(f.config,'utf8'));assert.equal(config.host.psmuxPath,path.join(installed,'backend/psmux.exe'));assert.equal(config.terminal.initialRows,6);assert.equal(config.terminal.autoHeight,false);assert.equal(config.display.showFiveHourUsage,true);assert.equal(config.display.showSevenDayUsage,true);assert.equal(report.readiness.hookTrust,'unknown');
});
