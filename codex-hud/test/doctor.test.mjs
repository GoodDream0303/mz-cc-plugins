import test from 'node:test';import assert from 'node:assert/strict';import {checkRuntime} from '../dist/runtime.js';
test('passive HUD diagnostics require no hooks and leave the native statusline unchanged',()=>{const report=checkRuntime();assert.equal(report.hooksRequired,false);assert.equal(report.nativeStatusline,'unchanged');assert.ok(!JSON.stringify(report).includes('/hooks'));});
test('doctor distinguishes configured backend from an unproven physical origin',()=>{
 const report=checkRuntime();assert.equal(report.host?.backend,'psmux');assert.equal(typeof report.host.configured,'boolean');assert.equal(report.host.verification,'required-at-attach');
});
