import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {defaultConfig,validateConfig,importClaude,saveConfig,loadConfig,set,get,preset,definitions} from '../dist/config.js';

test('config defaults and configuration labels are English while user text is preserved',()=>{
 assert.equal(get(defaultConfig(),'language'),'en');assert.ok(definitions.every(d=>!/[\u3400-\u9fff]/.test(d.label)));
 const config=set(defaultConfig(),'display.customLine','列出 Codex 常用插件');assert.equal(get(config,'display.customLine'),'列出 Codex 常用插件');
});

test('config import preserves explicit false and zero and maps the CLI version flag',()=>{
  const {config,report}=importClaude({display:{showTools:false,showAgents:true,showTodos:true,showMcp:true,showSessionTokens:true,sevenDayThreshold:0,showClaudeCodeVersion:true,showCost:true},gitStatus:{enabled:true,showDirty:false},extraFuture:{x:7}});
  assert.equal(get(config,'display.showTools'),false);
  assert.equal(get(config,'display.showAgents'),true);
  assert.equal(get(config,'display.sevenDayThreshold'),0);
  assert.equal(get(config,'display.showCodexVersion'),true);
  assert.equal(get(config,'gitStatus.showDirty'),false);
  assert.deepEqual(config.extraFuture,{x:7});
  assert.ok(report.some(r=>r.key==='display.showCost'&&r.status==='unavailable'));
  assert.ok(report.some(r=>r.key==='extraFuture.x'&&r.status==='unknown'));
});
test('config validation rejects wrong types, ranges, enums and prototype pollution',()=>{
  for(const value of [{display:{showTools:'false'}},{terminal:{paneSize:0}},{language:'xx'},{display:{usageThreshold:101}},JSON.parse('{"__proto__":{"polluted":true}}')]) assert.throws(()=>validateConfig(value));
  assert.throws(()=>set(defaultConfig(),'display.__proto__.x',1));
  assert.equal({}.polluted,undefined);
});
test('config atomic save roundtrips unknown values and keeps first backup on later writes',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hud-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'config.json');fs.writeFileSync(file,'{"future":{"keep":true}}');
  saveConfig(file,set(loadConfig(file),'display.showTools',true));
  const backup=fs.readFileSync(file+'.bak','utf8');
  saveConfig(file,set(loadConfig(file),'display.showTools',false));
  assert.equal(fs.readFileSync(file+'.bak','utf8'),backup);
  assert.deepEqual(loadConfig(file).future,{keep:true});
  assert.equal(get(loadConfig(file),'display.showTools'),false);
  const before=fs.readFileSync(file,'utf8');assert.throws(()=>saveConfig(file,{language:7}));assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('config invalid JSON is reported without changing the original file',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hud-bad-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config.json');fs.writeFileSync(file,'{bad');
  assert.throws(()=>loadConfig(file));assert.equal(fs.readFileSync(file,'utf8'),'{bad');
});
test('config presets are independent and preserve unknown advanced settings',()=>{
  const base=defaultConfig();base.extra={v:1};const minimal=preset('minimal',base);
  assert.equal(get(minimal,'display.showModel'),true);assert.equal(get(minimal,'display.showContextBar'),true);assert.equal(get(minimal,'display.showTools'),false);
  assert.deepEqual(minimal.extra,{v:1});assert.equal(get(preset('full',base),'display.showTools'),true);assert.equal(get(preset('full',base),'display.showCost'),false);
});
