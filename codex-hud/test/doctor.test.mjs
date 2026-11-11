import test from 'node:test';import assert from 'node:assert/strict';import {checkRuntime} from '../dist/runtime.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('passive HUD diagnostics require no hooks and leave the native statusline unchanged',()=>{const report=checkRuntime();assert.equal(report.hooksRequired,false);assert.equal(report.nativeStatusline,'unchanged');assert.equal(report.autostart.trust,'unknown');});
test('doctor distinguishes configured backend from an unproven physical origin',()=>{
 const report=checkRuntime();assert.equal(report.host?.backend,'psmux');assert.equal(typeof report.host.configured,'boolean');assert.equal(report.host.verification,'required-at-attach');
});

test('fresh-home doctor finds the packaged backend but still reports a missing official CLI',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-doctor-first-run-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'config.json'),report=checkRuntime({configFile:file,setup:{dependencies:{findCodex:()=>undefined}}});
 assert.equal(report.setup?.ready,false);assert.equal(report.setup.prerequisites.psmux.status,'ready');assert.ok(!report.setup.required.includes('psmux'));assert.ok(report.setup.required.includes('codex'));
 assert.equal(report.setup.hookTrust,'unknown');assert.equal(report.setup.scope,'runtime-prerequisites-only');assert.match(report.notes.join('\n'),/profile/);assert.equal(fs.existsSync(file),false);
});

test('doctor rejects a nonempty nonexistent backend while preserving configured metadata',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-doctor-backend-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'config.json');fs.writeFileSync(file,JSON.stringify({host:{psmuxPath:path.join(root,'missing.exe')},startup:{enabled:false}}));
 const report=checkRuntime({configFile:file});assert.equal(report.host.configured,true);assert.equal(report.setup?.ready,false);assert.equal(report.setup.prerequisites.psmux.status,'missing');assert.equal(report.autostart.enabled,false);
});
