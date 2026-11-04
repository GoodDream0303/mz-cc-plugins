import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const product=path.resolve(import.meta.dirname,'..');
function watchInput(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-watch-input-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'rollout-synthetic.jsonl'),JSON.stringify({type:'session_meta',payload:{id:'synthetic-input',source:'cli'}})+'\n');
 // Exercise the real watch loop with an in-memory TTY. Intercept only the external
 // clipboard write: these checks must never touch the user's system clipboard.
 const script=`
 import {PassThrough} from 'node:stream';import {EventEmitter} from 'node:events';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
 import {main} from './dist/cli.js';import {defaultConfig,set,saveConfig} from './dist/config.js';
 const root=process.argv[1],mode=process.argv[2],copies=[],frames=[],realOutput=process.stdout.write.bind(process.stdout);
 cp.execFileSync=(command,args,options)=>{if(command!=='powershell.exe')throw Error('Unexpected child command');copies.push(options.input);return '';};syncBuiltinESMExports();
 saveConfig(root+'/config.json',set(set(set(defaultConfig(),'display.customLine','alpha beta'),'display.customLinePosition','first'),'display.showContextBar',false));
 const input=new PassThrough();input.isTTY=true;input.setRawMode=()=>{};
 const output=new EventEmitter();Object.assign(output,{isTTY:true,columns:80,rows:12});let started=false;
 output.write=text=>{if(text.startsWith('\\x1b[H\\x1b[2J'))frames.push(text);if(!started&&text.includes('alpha beta')){started=true;setImmediate(()=>{
  input.write('\\x1b[<0;1;1M\\x1b[<32;3;1M');
  input.write(mode==='copy'?'\\x1b[<0;5;1m\\x03':'\\x1b[<0;5;1m\\x1b');
  setTimeout(()=>input.write('q'),1100);
 });}return true;};
 Object.defineProperty(process,'stdin',{value:input});Object.defineProperty(process,'stdout',{value:output});
 await main(['watch','--session','synthetic-input','--sessions-root',root,'--config',root+'/config.json']);
 realOutput(JSON.stringify({copies,highlighted:frames.at(-1)?.includes('\\x1b[7m')}));
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,root,mode],{cwd:product,encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
test('watch copies the release endpoint before Ctrl+C from the same input chunk',t=>{
 assert.deepEqual(watchInput(t,'copy').copies,['alpha']);
});
test('watch applies Escape after a mouse release from the same input chunk',t=>{
 const result=watchInput(t,'escape');assert.equal(result.highlighted,false);assert.deepEqual(result.copies,[]);
});
