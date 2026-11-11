import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import fsp from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {SessionReader} from '../dist/reader.js';import {render} from '../dist/render.js';import {defaultConfig,set,saveConfig} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';
const row=(type,payload)=>JSON.stringify({type,payload})+'\n';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-performance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));return root;}

test('idle reader validates both hash phases without duplicate reads or an increment buffer',async t=>{
 const root=fixture(t),file=path.join(root,'session.jsonl');fs.writeFileSync(file,row('session_meta',{id:'reader-perf'})+row('event_msg',{type:'ignored',padding:'x'.repeat(200)}).repeat(100));
 const reader=new SessionReader(file,'reader-perf');await reader.read();let reads=0,bytes=0,increments=0;
 const open=fsp.open,alloc=Buffer.alloc;
 t.mock.method(fsp,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);handle.read=async(...values)=>{const result=await read(...values);reads++;bytes+=result.bytesRead;return result;};return handle;});
 t.mock.method(Buffer,'alloc',function(size,...args){if(size===64*1024)increments++;return alloc(size,...args);});
 const snapshot=await reader.read();assert.equal(snapshot.sessionId,'reader-perf');assert.equal(reads,4);assert.equal(bytes,4*4096);assert.equal(increments,0);
});

test('reader still rejects a prefix changed while reading appended data',async t=>{
 const root=fixture(t),file=path.join(root,'session.jsonl'),meta=row('session_meta',{id:'reader-perf'});fs.writeFileSync(file,meta+row('event_msg',{type:'ignored',padding:'x'.repeat(200)}).repeat(100));
 const reader=new SessionReader(file,'reader-perf');await reader.read();fs.appendFileSync(file,row('turn_context',{model:'new-model'}));
 const open=fsp.open;let changed=false;
 t.mock.method(fsp,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);handle.read=async(buffer,...values)=>{const result=await read(buffer,...values);if(!changed&&buffer.length===64*1024){changed=true;const fd=fs.openSync(file,'r+');try{fs.writeSync(fd,Buffer.from(meta.replace('reader-perf','foreign-log')),0,Buffer.byteLength(meta),0);}finally{fs.closeSync(fd);}}return result;};return handle;});
 const snapshot=await reader.read();assert.equal(changed,true);assert.equal(snapshot.model,undefined);assert.ok(snapshot.errors.some(message=>message.includes('changed during read')));
});

test('relative timestamps avoid absolute formatting and retain localized output',t=>{
 const now=Date.UTC(2026,10,10,12),s={...emptySnapshot('time-perf'),quotas:[{id:'primary',minutes:300,usedPercent:25,resetsAt:now/1000+3600}]};
 const original=Date.prototype.toLocaleString;let absoluteCalls=0;t.mock.method(Date.prototype,'toLocaleString',function(...args){absoluteCalls++;return original.apply(this,args);});
 for(const language of ['en','zh-Hans','zh-Hant'])for(const format of ['relative','elapsed']){
  const config=set(set(defaultConfig(),'language',language),'display.timeFormat',format),text=render(s,config,{width:200,height:20,color:false,now}).lines.join('\n');assert.match(text,/1h 0m/);
 }
 assert.equal(absoluteCalls,0);
 for(const format of ['absolute','both','elapsedAndAbsolute'])render(s,set(defaultConfig(),'display.timeFormat',format),{width:200,height:20,color:false,now});
 assert.equal(absoluteCalls,3);
});

for(const json of [false,true])test('disabled Git skips text collection but preserves '+(json?'JSON facts':'text output'),t=>{
 const root=fixture(t),file=path.join(root,'session.jsonl'),configFile=path.join(root,'config.json');fs.writeFileSync(file,row('session_meta',{id:'git-perf',cwd:root}));saveConfig(configFile,set(defaultConfig(),'gitStatus.enabled',false));
 const cli=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href;
 const script=`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';let calls=0;const original=cp.execFileSync;cp.execFileSync=(file,...args)=>{if(file==='git'){calls++;return '## synthetic-branch\\n';}return original(file,...args);};const originalAsync=cp.execFile;cp.execFile=(file,args,options,callback)=>{if(file==='git'){calls++;queueMicrotask(()=>callback(null,'## synthetic-branch\\n',''));return {};}return originalAsync(file,args,options,callback);};syncBuiltinESMExports();const {main}=await import(${JSON.stringify(cli)});await main(['once','--session','git-perf','--sessions-root',process.argv[1],'--config',process.argv[2],...${JSON.stringify(json?['--json']:[])}]);console.log(JSON.stringify({calls}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,root,configFile],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const lines=result.stdout.trim().split(/\r?\n/);assert.equal(JSON.parse(lines.at(-1)).calls,json?1:0);if(json)assert.equal(JSON.parse(lines[0]).environment.git.branch,'synthetic-branch');
});
