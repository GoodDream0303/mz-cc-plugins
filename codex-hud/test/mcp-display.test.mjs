import test from 'node:test';import assert from 'node:assert/strict';
import {emptySnapshot} from '../dist/types.js';
const api=await import('../dist/mcp-display.js').catch(()=>({}));

test('MCP connection summary is one logical row so the terminal wraps only when needed',()=>{
 const result=api.mcpConnectionRows({...emptySnapshot('parent'),mcpUsed:['docs','debug']},'en');assert.equal(result.rows.length,1);assert.match(result.rows[0],/Official.*docs.*debug/);
});

test('idle nonofficial connections remain named while official inventory is summarized without a connection claim',()=>{
 assert.equal(typeof api.mcpConnectionRows,'function');
 const s={...emptySnapshot('parent'),environment:{mcp:[{name:'codex_apps',enabled:true},{name:'codex_tui',enabled:true},{name:'context7',enabled:true},{name:'debug',enabled:false}],errors:[]}};
 const result=api.mcpConnectionRows(s,'en'),text=result.rows.join('\n');assert.equal(result.persistent,true);
 assert.match(text,/Official.*Unknown/);assert.match(text,/context7.*Unknown/);assert.match(text,/debug.*Disabled \(config\)/);
 assert.doesNotMatch(text,/codex_apps|codex_tui|109|12 tools|connected/i);
 assert.equal(api.mcpConnectionRows({...emptySnapshot('parent'),mcpUsed:['codex_apps','codex_tui']},'en').persistent,false);
});

test('official filtering is exact and MCP names discovered by calls stay visible after completion',()=>{
 assert.equal(typeof api.mcpConnectionRows,'function');
 const s={...emptySnapshot('parent'),mcpUsed:['codex_apps_extra','docs','codex_tui'],tools:[{id:'a',name:'mcp__other__query',mcp:{server:'other',tool:'query'},status:'done'}]};
 const text=api.mcpConnectionRows(s,'zh-Hans').rows.join('\n');assert.match(text,/codex_apps_extra/);assert.match(text,/docs/);assert.match(text,/other/);assert.match(text,/未知/);assert.doesNotMatch(text,/已连接|codex_tui/);
});

test('the MCP call area contains separate active invocations only, with real elapsed timing when available',()=>{
 assert.equal(typeof api.mcpCallRows,'function');
 const tools=[{id:'a',name:'mcp__docs__query',mcp:{server:'docs',tool:'query'},startedAt:1000,status:'running'},{id:'b',name:'mcp__docs__query',mcp:{server:'docs',tool:'query'},startedAt:2000,status:'running'},{id:'c',name:'mcp__docs__done',status:'done'},{id:'d',name:'mcp__docs__failed',status:'failed'},{id:'e',name:'exec',status:'running'}];
 const rows=api.mcpCallRows(tools,'en',3400,4);assert.equal(rows.length,2);assert.match(rows[0].text,/docs \/ query.*2\.4s/);assert.match(rows[1].text,/docs \/ query.*1\.4s/);assert.doesNotMatch(rows.map(r=>r.text).join('\n'),/done|failed|exec|×/);
 assert.deepEqual(api.mcpCallRows(tools.filter(t=>t.status!=='running'),'en',3400,4),[]);
});

test('MCP presentation localizes unknown states, removes terminal controls and bounds active overflow',()=>{
 assert.equal(typeof api.mcpCallRows,'function');
 const tools=Array.from({length:3},(_,i)=>({id:String(i),name:'mcp__docs__query',status:'running'}));
 for(const [lang,label]of [['en','Unknown'],['zh-Hans','未知'],['zh-Hant','未知']]){
  const text=api.mcpConnectionRows({...emptySnapshot('parent'),mcpUsed:['docs\u001b[31m']},lang).rows.join('\n');assert.ok(text.includes(label));assert.ok(!text.includes('\u001b'));
  const rows=api.mcpCallRows(tools,lang,1000,2);assert.equal(rows.length,3);assert.match(rows[2].text,/\+1/);assert.ok(rows.every(r=>!r.text.includes('NaN')));
 }
});

test('connection rows use only fresh matching runtime states and combine official differences',()=>{
 const s={...emptySnapshot('thread-a'),mcpRuntime:{sessionId:'thread-a',checkedAt:1000,complete:true,servers:[{name:'codex_apps',status:'connected'},{name:'codex_tui',status:'starting'},{name:'docs',status:'authenticationRequired'}]}};
 const text=api.mcpConnectionRows(s,'en',2000).rows.join('\n');assert.match(text,/Official.*Mixed/);assert.match(text,/docs.*Authentication required/);assert.doesNotMatch(text,/codex_apps|codex_tui/);
 for(const runtime of [{...s.mcpRuntime,sessionId:'foreign'},{...s.mcpRuntime,checkedAt:-20000},{...s.mcpRuntime,complete:false}])assert.match(api.mcpConnectionRows({...s,mcpRuntime:runtime},'en',2000).rows[0],/Unknown/);
 const connected={...s,mcpRuntime:{...s.mcpRuntime,servers:[{name:'codex_apps',status:'connected'}]}};assert.match(api.mcpConnectionRows(connected,'en',2000).rows[0],/Official.*Connected/);
});

test('live connection states localize without changing configured-only disabled labels',()=>{
 const states=[['connected','已连接','已連線'],['starting','启动中','啟動中'],['failed','失败','失敗'],['cancelled','已取消','已取消'],['disabled','已禁用','已停用'],['notStarted','未启动','未啟動'],['authenticationRequired','需要认证','需要驗證']];
 for(const [status,zh,tw] of states){const s={...emptySnapshot('thread-a'),mcpRuntime:{sessionId:'thread-a',checkedAt:1000,complete:true,servers:[{name:'docs',status}]}};assert.match(api.mcpConnectionRows(s,'zh-Hans',1001).rows.join('\n'),new RegExp(zh));assert.match(api.mcpConnectionRows(s,'zh-Hant',1001).rows.join('\n'),new RegExp(tw));}
});
