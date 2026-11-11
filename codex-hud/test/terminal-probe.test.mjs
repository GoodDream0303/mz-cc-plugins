import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp,{spawnSync} from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import {checkRuntime,readLaunch} from '../dist/runtime.js';import {cleanEnvironment,copyPackagedRuntime} from './support/clean-env.mjs';
const product=path.resolve(import.meta.dirname,'..');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-terminal-probe-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));return root;}
function report(t,failure,configFile=path.join(fixture(t),'config.json')){
 const original=cp.execFileSync;cp.execFileSync=(file,args)=>{assert.equal(file,'where.exe');assert.deepEqual(args,['wt.exe']);if(failure)throw failure;return '';};syncBuiltinESMExports();
 try{return checkRuntime({configFile,setup:{dependencies:{findCodex:()=>undefined,isFile:()=>false}}});}finally{cp.execFileSync=original;syncBuiltinESMExports();}
}
for(const [name,failure,expected]of [
 ['available',undefined,{status:'available'}],
 ['missing',Object.assign(new Error('not found'),{status:1}),{status:'missing',code:'EXIT_1'}],
 ['timeout',Object.assign(new Error('private probe output'),{code:'ETIMEDOUT'}),{status:'timed-out',code:'ETIMEDOUT'}],
 ['missing finder',Object.assign(new Error('private finder path'),{code:'ENOENT'}),{status:'failed',code:'ENOENT'}],
 ['access denied',Object.assign(new Error('private error'),{code:'EACCES'}),{status:'failed',code:'EACCES'}],
 ['other exit',Object.assign(new Error('private command output'),{status:2}),{status:'failed',code:'EXIT_2'}],
])test('terminal lookup distinguishes '+name+' without retaining process output',t=>{
 const actual=report(t,failure);assert.deepEqual(actual.terminalCheck,expected);assert.equal(actual.terminal,expected.status==='available');assert.ok(!JSON.stringify(actual).includes('private'));
});
test('doctor reads status beside its explicit configuration instead of inherited HUD settings',t=>{
 const root=fixture(t),selected=path.join(root,'selected/config.json'),inherited=path.join(root,'inherited/config.json');
 for(const [file,status]of [[selected,'disabled'],[inherited,'opened']]){fs.mkdirSync(path.join(path.dirname(file),'runtime'),{recursive:true});fs.writeFileSync(path.join(path.dirname(file),'runtime/autostart-status.json'),JSON.stringify({status}));}
 const previous=process.env.MZ_HUD_CONFIG_FILE;process.env.MZ_HUD_CONFIG_FILE=inherited;
 try{assert.equal(report(t,undefined,selected).autostart.lastResult,'disabled');}finally{if(previous===undefined)delete process.env.MZ_HUD_CONFIG_FILE;else process.env.MZ_HUD_CONFIG_FILE=previous;}
});
test('offline packaged demo preview needs no Terminal discovery and respects explicit config for doctor and stop',{skip:process.platform!=='win32'},t=>{
 const root=fixture(t),installed=path.join(root,'未配置环境 space/plugin'),marker=path.join(root,'probe-called'),preload=path.join(root,'no-probes.mjs');
 copyPackagedRuntime(product,installed);
 fs.writeFileSync(preload,`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.execFileSync=()=>{fs.writeFileSync(${JSON.stringify(marker)},'called');throw Error('Dry-run performed a process probe');};syncBuiltinESMExports();`);
 const selected=path.join(root,'selected/config.json'),decoy=path.join(root,'decoy/config.json'),env=cleanEnvironment(root,{MZ_HUD_CONFIG_FILE:decoy});
 const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,path.join(installed,'bin/hud.mjs'),'demo','--dry-run','--config',selected],{cwd:root,env,encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);assert.equal(fs.existsSync(marker),false);assert.equal(fs.existsSync(path.join(installed,'node_modules')),false);
 const info=JSON.parse(result.stdout),d=readLaunch(info.launch);assert.equal(path.dirname(d.file),path.join(root,'selected/runtime'));assert.ok(d.codexHome.startsWith(path.dirname(d.file)+path.sep));assert.equal(d.configFile,selected);assert.equal(fs.existsSync(path.join(root,'decoy/runtime')),false);
 const doctor=spawnSync(process.execPath,[path.join(installed,'bin/hud.mjs'),'doctor','--launch',d.id,'--config',selected],{cwd:root,env,encoding:'utf8',timeout:10000});assert.equal(doctor.status,0,doctor.stderr);assert.equal(JSON.parse(doctor.stdout).display.status,'closed');
 const stop=spawnSync(process.execPath,[path.join(installed,'bin/hud.mjs'),'stop','--launch',d.id,'--config',selected],{cwd:root,env,encoding:'utf8',timeout:10000});assert.equal(stop.status,0,stop.stderr);assert.equal(readLaunch(d.file).hudStop,true);assert.equal(fs.existsSync(path.join(root,'decoy/runtime')),false);
});
test('real demo lookup timeout reports lookup failure before creating a launch or opening Terminal',{skip:process.platform!=='win32'},t=>{
 const root=fixture(t),selected=path.join(root,'config.json'),decoy=path.join(root,'decoy.json'),backend=path.join(root,'decoy-backend.exe'),marker=path.join(root,'decoy-probed');
 fs.writeFileSync(backend,'synthetic finder fixture');fs.writeFileSync(decoy,JSON.stringify({host:{psmuxPath:backend}}));
 const script=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.execFileSync;cp.execFileSync=(file,args,...rest)=>{if(file===process.argv[2]){fs.writeFileSync(process.argv[3],'called');throw Error('Wrong configuration backend was probed');}if(file==='where.exe'&&args[0]==='wt.exe')throw Object.assign(Error('private probe output'),{code:'ETIMEDOUT'});return original(file,args,...rest);};syncBuiltinESMExports();const {main}=await import('./dist/cli.js');try{await main(['demo','--config',process.argv[1]]);}catch(error){console.error(error.message);process.exitCode=1;}`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,selected,backend,marker],{cwd:product,env:cleanEnvironment(root,{MZ_HUD_CONFIG_FILE:decoy}),encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);assert.match(result.stderr,/Windows Terminal lookup timed out/);assert.doesNotMatch(result.stderr,/Terminal is missing|private probe output/);assert.equal(fs.existsSync(path.join(root,'runtime')),false);assert.equal(fs.existsSync(marker),false,'Explicit demo configuration must not probe an inherited backend');
});
