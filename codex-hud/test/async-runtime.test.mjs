import test from 'node:test';import assert from 'node:assert/strict';
import {readEnvironment} from '../dist/environment.js';
const api=await import('../dist/subprocess.js').catch(()=>({}));
test('a recurring child query leaves the event loop responsive and cancellation terminates it',async()=>{
 assert.equal(typeof api.runText,'function','async runtime queries are missing');
 let tick=false;const timer=setTimeout(()=>{tick=true;},10);
 const output=await api.runText(process.execPath,['-e',"setTimeout(()=>process.stdout.write('ready'),100)"],{timeout:2000,maxBuffer:1024});
 clearTimeout(timer);assert.equal(tick,true);assert.equal(output,'ready');
 const controller=new AbortController();const pending=api.runText(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeout:2000,maxBuffer:1024,signal:controller.signal});controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
});
test('asynchronous Git facts match the existing facts and cached result shape',async()=>{
 const env=await import('../dist/environment.js');assert.equal(typeof env.readEnvironmentAsync,'function');
 const asyncFacts=await env.readEnvironmentAsync(process.cwd());assert.deepEqual(asyncFacts,readEnvironment(process.cwd()));assert.deepEqual(asyncFacts.errors,[]);
});
