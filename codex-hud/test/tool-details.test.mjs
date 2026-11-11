import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../dist/tool-details.js').catch(()=>({}));

test('MCP tool names do not gain special metadata or expose their arguments',()=>{
 assert.equal(typeof api.toolDetails,'function');
 assert.deepEqual(api.toolDetails('mcp__my_docs__query_docs',{token:'SECRET'}),{});
 assert.deepEqual(api.toolDetails('functions.mcp__codex_apps__context7_query',{token:'SECRET'}),{});
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
  ['node --test; echo SECRET',{kind:'mixed',operations:['test','other']}],
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

test('wrapped shell commands identify operations rather than only the shell',()=>{
 for(const [cmd,want]of [
  [['powershell.exe','-NoProfile','-Command',"Get-Content -LiteralPath 'C:/private/SECRET.md'"],{kind:'read'}],
  [['pwsh','-Command',"& 'C:/Program Files/node/npm.cmd' run build"],{kind:'build'}],
  [['bash','-lc','rg --files src'],{kind:'list'}],
  [['cmd.exe','/c','git status --porcelain'],{kind:'git',target:'status'}],
  ['Get-ChildItem -LiteralPath C:/private',{kind:'list'}],
  ['Select-String -Path source.ts -Pattern SECRET',{kind:'search'}],
  ['Set-Content -LiteralPath private.txt -Value SECRET',{kind:'write'}],
  ['Get-FileHash private.txt',{kind:'check'}],
  ['Get-Process -Id 12',{kind:'process'}],
  ['npm install --offline',{kind:'install'}],
  ['node --version',{kind:'environment'}],
 ]){const action=api.commandDetails(cmd);assert.deepEqual(action,want);assert.ok(!JSON.stringify(action).includes('SECRET'));}
});

test('mixed commands retain all distinct operations and never count quoted command names',()=>{
 assert.deepEqual(api.commandDetails("Get-Content 'C:/private/SECRET.md'\nrg pattern src"),{kind:'mixed',operations:['read','search']});
 assert.deepEqual(api.commandDetails(undefined,[{type:'read',path:'SECRET.md'},{type:'search'},{type:'read'}]),{kind:'mixed',operations:['read','search']});
 assert.deepEqual(api.commandDetails('Get-Content source.txt > target.txt'),{kind:'mixed',operations:['read','write']});
 assert.deepEqual(api.commandDetails('Get-Content source.txt; custom-command SECRET'),{kind:'mixed',operations:['read','other']});
 assert.equal(api.commandDetails('Write-Output "Get-Content SECRET"'),undefined);
 assert.equal(api.commandDetails('# Get-Content SECRET\nWrite-Output ok'),undefined);
 assert.deepEqual(api.commandDetails(['pwsh','-EncodedCommand','SECRET']),{kind:'powershell'});
 assert.equal(api.commandDetails("if ($false) { Remove-Item SECRET }"),undefined);
 assert.deepEqual(api.commandDetails('node arbitrary-tests.js'),{kind:'node'});
});

test('literal orchestration script commands gain safe operation labels without evaluating code',()=>{
 assert.deepEqual(api.toolDetails('functions.exec',"const r = await tools.exec_command({cmd: 'Get-Content SECRET'}); text(r.output);"),{action:{kind:'read'}});
 assert.deepEqual(api.toolDetails('exec',"await Promise.allSettled([tools.exec_command({cmd:'Get-Content SECRET'}), tools.exec_command({cmd:'rg needle src'})]);"),{action:{kind:'mixed',operations:['read','search']}});
 assert.deepEqual(api.toolDetails('exec','const decoy = "tools.exec_command({cmd: Get-Content SECRET})"; text(decoy);'),{});
 assert.deepEqual(api.toolDetails('exec','await tools.exec_command({cmd: dynamicCommand});'),{});
 assert.deepEqual(api.toolDetails('exec','const f = () => tools.exec_command({cmd:"Remove-Item SECRET"});'),{});
 assert.deepEqual(api.toolDetails('other.exec',"await tools.exec_command({cmd:'Get-Content SECRET'});"),{});
});

test('classification remains conservative for partial metadata and dynamic command expressions',()=>{
 assert.deepEqual(api.commandDetails(undefined,[{type:'read'},{type:'unknown'}]),{kind:'mixed',operations:['read','other']});
 assert.deepEqual(api.toolDetails('exec','await tools.exec_command({cmd:"Get-Content file" + suffix});'),{});
 assert.deepEqual(api.toolDetails('exec','await other.tools.exec_command({cmd:"Remove-Item file"});'),{});
 assert.deepEqual(api.commandDetails(['pwsh','-File','custom.ps1','-Command','Get-Content file']),{kind:'powershell'});
 assert.equal(api.commandDetails("@'\nGet-Content text\n'@ | python -"),undefined);
 assert.equal(api.commandDetails('Get-Content ' + 'x'.repeat(32768)),undefined);
 assert.equal(api.commandDetails('certutil -urlcache -split -f https://example.invalid/file'),undefined);
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
