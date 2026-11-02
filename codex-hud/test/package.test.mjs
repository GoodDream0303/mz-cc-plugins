import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import os from 'node:os';
const root=path.resolve(import.meta.dirname,'..');
test('marketplace package runs offline without node_modules or a build step',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hud-distribution-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const installed=path.join(tmp,'codex-hud');
 fs.cpSync(root,installed,{recursive:true,filter:file=>!['node_modules','src','test','scripts'].includes(path.relative(root,file).split(path.sep)[0])});
 const config=path.join(tmp,'config.json');fs.writeFileSync(config,JSON.stringify({startup:{enabled:false}}));
 const env={...process.env,LOCALAPPDATA:tmp,APPDATA:tmp,NODE_PATH:''};delete env.NODE_OPTIONS;
 const cli=spawnSync(process.execPath,['bin/hud.mjs','doctor','--config',config],{cwd:installed,env,encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).configuration.status,'valid');
 const hook=spawnSync(process.execPath,['hooks/session-start.mjs'],{cwd:installed,env,input:JSON.stringify({hook_event_name:'SessionStart',source:'compact'}),encoding:'utf8'});assert.equal(hook.status,0,hook.stderr);assert.equal(hook.stdout,'');assert.equal(hook.stderr,'');
 assert.ok(fs.statSync(path.join(installed,'dist','vendor','smol-toml','LICENSE')).isFile());
});
test('CLI help exposes commands on separate readable lines',()=>{
 const result=spawnSync(process.execPath,['bin/hud.mjs','help'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/\n  start /);assert.match(result.stdout,/\n  configure\n/);
});
test('package registers only the quiet startup/resume autostart hook',t=>{
 const marketplace=JSON.parse(fs.readFileSync(path.join(root,'..','.agents','plugins','marketplace.json'),'utf8'));assert.equal(marketplace.name,'mz-cc-plugins');assert.ok(marketplace.plugins.some(p=>p.name==='task-handoff'));const entry=marketplace.plugins.find(p=>p.name==='codex-hud');assert.ok(entry);assert.equal(path.resolve(root,'..',entry.source.path),root);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin','plugin.json'),'utf8'));assert.equal(manifest.hooks,'./hooks/hooks.json');const hooks=JSON.parse(fs.readFileSync(path.join(root,manifest.hooks),'utf8'));assert.deepEqual(Object.keys(hooks.hooks),['SessionStart']);const group=hooks.hooks.SessionStart[0];const matcher=new RegExp(group.matcher);assert.ok(matcher.test('startup')&&matcher.test('resume'));assert.ok(!matcher.test('compact')&&!matcher.test('fork'));assert.equal(group.hooks[0].async,true);
 for(const skill of ['hud-start','hud-configure','hud-doctor'])assert.ok(fs.statSync(path.join(root,'skills',skill,'SKILL.md')).isFile());
});
test('package CLI can configure and render fixture telemetry with English labels and original task names',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hud-cli-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const config=path.join(tmp,'config.json');
 const run=(args,input)=>spawnSync(process.execPath,['bin/hud.mjs',...args],{cwd:root,input,encoding:'utf8'});
 assert.equal(run(['config','set','display.showTodos','true','--config',config]).status,0);
 const row=(type,payload)=>JSON.stringify({type,payload,timestamp:'2026-11-02T00:00:00Z'})+'\n';fs.writeFileSync(path.join(tmp,'rollout-test.jsonl'),row('session_meta',{id:'session-fixture',cwd:'C:/Firmware'})+row('turn_context',{model:'sample',effort:'high'})+row('response_item',{type:'function_call',call_id:'plan',name:'update_plan',arguments:JSON.stringify({plan:[{step:'列出 Codex 常用插件',status:'in_progress'}]})}));
 const result=run(['once','--session','session-fixture','--sessions-root',tmp,'--config',config]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Context/);assert.match(result.stdout,/Todo/);assert.match(result.stdout,/列出 Codex 常用插件/);assert.ok(!result.stdout.includes('上下文'));
});
