import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {hostFixture} from './support/host-fixture.mjs';import {defaultConfig,saveConfig} from '../dist/config.js';
test('manual start cannot replace the owner display with a subagent transcript',{skip:process.platform!=='win32'},t=>{
 const f=hostFixture(t),transcript=path.join(f.root,'subagent.jsonl'),config=path.join(f.root,'config.json');saveConfig(config,defaultConfig());
 fs.writeFileSync(transcript,JSON.stringify({type:'session_meta',payload:{id:'agent-thread',cwd:f.root,source:{subagent:{thread_spawn:{parent_thread_id:'main-thread'}}}}})+'\n');
 const url=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href,probe=path.join(f.root,'probe.mjs');
 fs.writeFileSync(probe,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
 cp.execFileSync=(command,args)=>{if(command==='powershell.exe')return JSON.stringify([{pid:process.pid,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'},{pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},{pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},{pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'}]);if(command===${JSON.stringify(f.record.proof.origin.binary)})return args.includes('split-window')?'%7':'codex\\t@1\\t%1\\t201\\t120\\t40\\t101';throw Error('Unexpected command');};
 syncBuiltinESMExports();const {main}=await import(${JSON.stringify(url)});try{await main(['start','--sessions-root',${JSON.stringify(f.root)},'--config',${JSON.stringify(config)}]);}catch(error){console.error(error.message);process.exitCode=1;}`);
 const result=spawnSync(process.execPath,[probe],{env:{...process.env,...f.environment,CODEX_THREAD_ID:'agent-thread'},encoding:'utf8',timeout:15000});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/main CLI|subagent|provenance/i);
 const descriptors=fs.readdirSync(f.runtime).filter(n=>/^[a-f0-9-]{36}\.json$/i.test(n));assert.equal(descriptors.length,0,'rejection must happen before creating a HUD intent');
});
