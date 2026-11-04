import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('watch leaves mouse selection to the terminal and Ctrl+C keeps the viewer open',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-terminal-selection-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const script=`
 import {PassThrough} from 'node:stream';import {EventEmitter} from 'node:events';import {main} from './dist/cli.js';
 const input=new PassThrough();input.isTTY=true;input.setRawMode=()=>{};
 const output=new EventEmitter();Object.assign(output,{isTTY:true,columns:80,rows:12});
 const realWrite=process.stdout.write.bind(process.stdout),writes=[];let started=false,quitSent=false;
 output.write=text=>{writes.push(text);if(!started&&text.startsWith('\\x1b[H')){started=true;setImmediate(()=>input.write('\\x03'));setTimeout(()=>{quitSent=true;input.write('q');},350);}return true;};
 Object.defineProperty(process,'stdin',{value:input});Object.defineProperty(process,'stdout',{value:output});
 await main(['watch','--session','synthetic-terminal','--sessions-root',process.argv[1],'--config',process.argv[1]+'/config.json']);
 realWrite(JSON.stringify({quitSent,mouseReportingEnabled:writes.some(text=>/\\x1b\\[\\?100[026]h/.test(text))}));
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,root],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);const actual=JSON.parse(result.stdout);assert.equal(actual.quitSent,true);assert.equal(actual.mouseReportingEnabled,false);
});
