import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../dist/tool-details.js').catch(()=>({}));

test('MCP identities are parsed only from the actual MCP namespace without inspecting arguments',()=>{
 assert.equal(typeof api.toolDetails,'function');
 assert.deepEqual(api.toolDetails('mcp__my_docs__query_docs',{token:'SECRET'}),{mcp:{server:'my_docs',tool:'query_docs'}});
 assert.deepEqual(api.toolDetails('functions.mcp__codex_apps__context7_query',{token:'SECRET'}),{mcp:{server:'codex_apps',tool:'context7_query'}});
 assert.deepEqual(api.toolDetails('other.mcp__docs__query',{}),{});
 assert.deepEqual(api.toolDetails('exec',{input:'await tools.mcp__docs__query({token:"SECRET"})'}),{});
});

test('command metadata identifies test, build, Git and shell actions without retaining raw parameters',()=>{
 assert.equal(typeof api.commandDetails,'function');
 for(const [command,want]of [
  [['node','--test','test/reader.test.mjs'],{kind:'nodeTest'}],
  ['npm run build',{kind:'build'}],
  [['git','-C','C:/private/repo','status','--porcelain'],{kind:'git',target:'status'}],
  [['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe','-Command','SECRET'],{kind:'powershell'}],
  [['node','-e','SECRET'],{kind:'node'}],
  [['node','script.js','--test'],{kind:'node'}],
  [['node','--','script.js','--test'],{kind:'node'}],
  ['node --test; echo SECRET',undefined],
  ['unknown SECRET',undefined],
 ])assert.deepEqual(api.commandDetails(command),want);
 assert.deepEqual(api.commandDetails(['SECRET'],[{type:'read',path:'C:/private/source/render.ts'}]),{kind:'read',target:'render.ts'});
 assert.deepEqual(api.toolDetails('apply_patch','*** Begin Patch\n*** Update File: C:/private/source/render.ts\nSECRET\n*** End Patch'),{action:{kind:'patch',target:'render.ts'}});
 assert.ok(!JSON.stringify(api.commandDetails(['node','-e','SECRET'])).includes('SECRET'));
});

test('unsafe or credential-shaped file labels are not retained as action summaries',()=>{
 assert.equal(typeof api.commandDetails,'function');
 for(const file of ['C:/repo/sk-PRIVATEKEY','C:/repo/ghp_PRIVATEKEY','C:/repo/a\u001b[31m.ts','C:/repo/a; SECRET.ts']){
  const action=api.commandDetails(undefined,[{type:'read',path:file}]);assert.deepEqual(action,{kind:'read'});
 }
});
test('a truncated patch cannot claim one target when later file headers are not inspected',()=>{
 assert.deepEqual(api.toolDetails('apply_patch','*** Begin Patch\n*** Update File: one.ts\n'+'x'.repeat(9000)+'\n*** Update File: two.ts\n*** End Patch'),{action:{kind:'patch'}});
});
test('agent action summaries retain only the declared task target and never prompts or message bodies',()=>{
 for(const [name,args,want]of [
  ['spawn_agent',{task_name:'hud_live_check',message:'SECRET PROMPT'},{action:{kind:'agentSpawn',target:'hud_live_check'}}],
  ['collaboration.followup_task',{target:'/root/hud_live_check',message:'SECRET MESSAGE'},{action:{kind:'agentFollowup',target:'/root/hud_live_check'}}],
  ['interrupt_agent',{target:'child-id'},{action:{kind:'agentInterrupt',target:'child-id'}}],
  ['resume_agent',{id:'child-id'},{action:{kind:'agentResume',target:'child-id'}}],
  ['close_agent',{id:'child-id'},{action:{kind:'agentClose',target:'child-id'}}],
  ['send_message',{target:'child-id',message:'SECRET MESSAGE'},{action:{kind:'agentMessage',target:'child-id'}}],
  ['wait_agent',{timeout_ms:1000},{action:{kind:'agentWait'}}],
 ]){const result=api.toolDetails(name,args);assert.deepEqual(result,want);assert.ok(!JSON.stringify(result).includes('SECRET'));}
 assert.deepEqual(api.toolDetails('other.spawn_agent',{task_name:'no-alias'}),{});
});
