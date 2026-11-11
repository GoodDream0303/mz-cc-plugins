import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {defaultConfig,set} from '../dist/config.js';
const api=await import('../dist/setup-readiness.js').catch(()=>({}));

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-readiness-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const psmux=path.join(root,'psmux.exe');fs.writeFileSync(psmux,'not executable: version probe is injected');
 const pkg=path.join(root,'node_modules','@openai','codex');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'}}));
 fs.writeFileSync(path.join(pkg,'bin','codex.js'),"throw new Error('Readiness must never launch Codex');");
 const command=path.join(root,'codex.cmd');fs.writeFileSync(command,'@echo readiness must not launch this');
 return {root,psmux,command,config:set(defaultConfig(),'host.psmuxPath',psmux),options:{platform:'win32',nodeVersion:'v20.19.0',dependencies:{findCodex:()=>command,version:()=> 'psmux 3.4.0 (20aa1d7)'}}};
}

test('explicitly unconfigured readiness lists missing backend and official CLI without changing preferences',()=>{
 assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 const config=set(defaultConfig(),'host.psmuxPath',''),before=structuredClone(config);
 const report=api.inspectSetup(config,{platform:'win32',nodeVersion:'v24.15.0',dependencies:{findCodex:()=>undefined}});
 assert.equal(report.ready,false);assert.equal(report.prerequisites.psmux.status,'missing');assert.equal(report.prerequisites.codex.status,'missing');
 assert.ok(report.required.includes('psmux'));assert.ok(report.required.includes('codex'));assert.deepEqual(config,before);
 assert.match(report.steps.join('\n'),/psmux.*3\.4\.0.*20aa1d7/);assert.match(report.steps.join('\n'),/Node.*20/);
});

test('verified runtime prerequisites remain distinct from hook trust and interactive acceptance',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 const before=fs.readdirSync(f.root),report=api.inspectSetup(f.config,f.options);
 assert.equal(report.ready,true);assert.equal(report.scope,'runtime-prerequisites-only');assert.deepEqual(report.required,[]);
 assert.equal(report.prerequisites.psmux.status,'ready');assert.equal(report.prerequisites.codex.kind,'npm');
 assert.equal(report.hookTrust,'unknown');assert.equal(report.interactiveAcceptance,'unverified');
 assert.match(report.steps.join('\n'),/native.*\/hooks/);assert.deepEqual(fs.readdirSync(f.root),before);
});

test('nonexistent, relative, wrong-build and failed backend probes are actionable',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 for(const [value,status]of [[path.join(f.root,'absent.exe'),'missing'],['relative/psmux.exe','invalid-path']]){
  const report=api.inspectSetup(set(f.config,'host.psmuxPath',value),f.options);assert.equal(report.ready,false);assert.equal(report.prerequisites.psmux.status,status);
 }
 for(const version of [()=> 'psmux 3.4.0 (another-build)',()=> 'psmux 3.5.0 (20aa1d7)',()=>{throw new Error('timeout');}]){
  const report=api.inspectSetup(f.config,{...f.options,dependencies:{...f.options.dependencies,version}});assert.equal(report.ready,false);assert.ok(report.required.includes('psmux'));assert.notEqual(report.prerequisites.psmux.status,'ready');
 }
});

test('unsupported Node and platform and invalid configuration cannot report readiness',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 for(const [override,required]of [[{nodeVersion:'v18.20.0'},'node'],[{platform:'linux'},'platform'],[{configValid:false},'configuration']]){
  const report=api.inspectSetup(f.config,{...f.options,...override});assert.equal(report.ready,false);assert.ok(report.required.includes(required));
 }
});

test('explicit paused and legacy-safe startup preferences are preserved',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 for(const mode of ['inherit','enabled','disabled']){
  const config=set(set(f.config,'startup.enabled',false),'host.autoStart',mode),before=structuredClone(config),report=api.inspectSetup(config,f.options);
  assert.equal(report.preferences.autoStart,mode);assert.equal(report.preferences.legacyEnabled,false);assert.equal(report.preferences.effectiveEnabled,mode==='enabled');assert.deepEqual(config,before);
 }
});

test('unsupported official launcher layout is reported without executing it',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 fs.writeFileSync(path.join(f.root,'node_modules','@openai','codex','package.json'),JSON.stringify({name:'someone-else',bin:{codex:'bin/codex.js'}}));
 const report=api.inspectSetup(f.config,f.options);assert.equal(report.ready,false);assert.equal(report.prerequisites.codex.status,'unsupported');assert.ok(report.required.includes('codex'));
});

test('readiness validates malformed configuration even without a caller validity hint',t=>{
 const f=fixture(t);assert.equal(typeof api.inspectSetup,'function','first-run readiness inspection is missing');
 const report=api.inspectSetup({...f.config,terminal:[]},f.options);
 assert.equal(report.ready,false);assert.equal(report.prerequisites.configuration.status,'invalid');assert.ok(report.required.includes('configuration'));
});
