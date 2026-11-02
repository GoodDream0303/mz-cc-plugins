import test from 'node:test';import assert from 'node:assert/strict';import {checkRuntime} from '../dist/runtime.js';
test('passive HUD diagnostics require no hooks and leave the native statusline unchanged',()=>{const report=checkRuntime();assert.equal(report.hooksRequired,false);assert.equal(report.nativeStatusline,'unchanged');assert.ok(!JSON.stringify(report).includes('/hooks'));});
