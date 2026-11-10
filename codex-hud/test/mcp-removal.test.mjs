import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {render} from '../dist/render.js';import {definitions,validateConfig,defaultConfig} from '../dist/config.js';import {emptySnapshot} from '../dist/types.js';import {readEnvironment} from '../dist/environment.js';

test('legacy MCP settings cannot restore dedicated connection or call rows in any language',()=>{
 for(const language of ['en','zh-Hans','zh-Hant']){
  const config=validateConfig({language,display:{showMcp:true,showTools:true,toolsMaxVisible:0},host:{runtime:'localAppServer'},elementOrder:['context','mcp','tools','mcpCalls']}),snapshot={...emptySnapshot('thread-a'),environment:{mcp:[{name:'private-server',enabled:true}],errors:[]},mcpUsed:['private-server'],tools:[{id:'cmd',name:'exec_command',status:'running'},{id:'mcp',name:'mcp__docs__query',status:'running'}]};
  const result=render(snapshot,config,{width:240,height:30,color:false}).lines.join('\n');
  assert.doesNotMatch(result,/MCP connections:|MCP calls:|MCP连接:|MCP调用:|MCP連線:|MCP呼叫:|private-server/);
  assert.match(result,/mcp__docs__query ×1/,'MCP tools retain normal activity tracking');
  assert.match(result,language==='en'?/Run command/:language==='zh-Hans'?/执行命令/:/執行命令/);
 }
});

test('MCP controls are absent from defaults and configuration menus while legacy files still load',()=>{
 for(const key of ['display.showMcp','colors.mcpConnected','host.runtime'])assert.ok(!definitions.some(d=>d.key===key),key);
 assert.ok(!defaultConfig().elementOrder.includes('mcp'));assert.ok(!Object.hasOwn(emptySnapshot('thread-a'),'mcpUsed'));
 assert.doesNotThrow(()=>validateConfig({display:{showMcp:true},colors:{mcpConnected:'green'},host:{runtime:'localAppServer'}}));
});

test('environment inspection no longer reads MCP configuration',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-no-mcp-config-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'config.toml'),'invalid toml = [');
 const facts=readEnvironment(root,root);assert.deepEqual(facts.errors,[]);assert.ok(!Object.hasOwn(facts,'mcp'));
});
