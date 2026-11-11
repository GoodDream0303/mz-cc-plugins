// Visible, uniquely named test windows. Synthetic official-package/CLI fixtures only.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
import {defaultConfig,set,saveConfig} from '../dist/config.js';import {readHost} from '../dist/host-session.js';import {readLaunch,requestStop} from '../dist/runtime.js';
const product=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),index=process.argv.indexOf('--psmux'),binary=process.argv[index+1];
if(index<0||!path.isAbsolute(binary))throw Error('smoke-entry-gui.mjs --psmux ABSOLUTE_PINNED_EXE');
const allRoles=['A','B','C','D','L','R'],root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-entry-desktop-')),tag=randomUUID().slice(0,8),names={tabs:'mzhud-tabs-'+tag,C:'mzhud-window-C-'+tag,D:'mzhud-window-D-'+tag,split:'mzhud-split-'+tag},titles=Object.fromEntries(allRoles.map(role=>[role,'HUD TEST '+role+' '+tag])),splitTitle='HUD TEST SPLIT '+tag;
const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),roles=new Map(),checks=[],previewOnly=process.argv.includes('--preview-only');
async function wait(check,message,ms=30000){const until=Date.now()+ms;do{try{const value=await check();if(value)return value;}catch{}await delay(150);}while(Date.now()<until);throw Error(message);}
const shim=path.join(root,'npm'),pkg=path.join(shim,'node_modules/@openai/codex'),fake=path.join(root,'codex.exe');fs.mkdirSync(path.join(pkg,'bin'),{recursive:true});fs.cpSync(process.execPath,fake);fs.writeFileSync(path.join(shim,'codex.ps1'),'# Synthetic npm shim; no official Codex is launched\n');
fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@openai/codex',bin:{codex:'bin/codex.js'},type:'module'}));
fs.writeFileSync(path.join(pkg,'bin/codex.js'),`import {spawn} from 'node:child_process';const child=spawn(${JSON.stringify(fake)},[${JSON.stringify(path.join(product,'scripts/smoke-host.mjs'))},'--fixture',process.env.MZ_HUD_SMOKE_ROLE,${JSON.stringify(root)},${JSON.stringify(process.execPath)}],{stdio:'inherit'});child.on('exit',code=>{process.exitCode=code??1;});`);
const configFile=path.join(root,'local/mz-codex-hud/config.json');saveConfig(configFile,set(set(set(defaultConfig(),'host.psmuxPath',binary),'startup.enabled',false),'host.autoStart','enabled'));fs.mkdirSync(path.join(root,'codex-home'));fs.mkdirSync(path.join(root,'samecwd'));
const quote=s=>"'"+s.replaceAll("'","''")+"'",boot=path.join(root,'boot.ps1');
const trace=path.join(root,'trace-errors.mjs');fs.writeFileSync(trace,`import fs from 'node:fs';const original=console.error;console.error=(...args)=>{fs.appendFileSync(${JSON.stringify(path.join(root,'trace-errors.jsonl'))},JSON.stringify({pid:process.pid,role:process.env.MZ_HUD_SMOKE_ROLE,message:args.map(value=>String(value)).join(' ')})+'\\n');original(...args);};`);
fs.writeFileSync(boot,`param([string]$Role)\n$ErrorActionPreference='Stop'\nGet-ChildItem Env: | Where-Object { $_.Name -match '^(TMUX|PSMUX_)|^MZ_HUD_(ORIGIN|NAMESPACE|HOST_DIR|PSMUX|CONFIG_FILE)$' } | ForEach-Object { Remove-Item -LiteralPath ('Env:'+$_.Name) }\n$env:PATH=${quote(shim)}+[IO.Path]::PathSeparator+$env:PATH\n$env:LOCALAPPDATA=${quote(path.join(root,'local'))}\n$env:CODEX_HOME=${quote(path.join(root,'codex-home'))}\n$env:MZ_HUD_SMOKE_ROLE=$Role\n$env:MZ_HUD_SMOKE_FOOTER='1'\n$env:MZ_HUD_SMOKE_EXPIRES_AT=${quote(previewOnly?String(Date.now()+1800000):'')}\n$env:NODE_OPTIONS=${quote('--import='+new URL('file:///'+trace.replaceAll('\\','/')).href)}\nSet-Location -LiteralPath ${quote(path.join(root,'samecwd'))}\n. ${quote(path.join(product,'bin/powershell-entry.ps1'))} -HudCli ${quote(path.join(product,'bin/hud.mjs'))} -NodePath ${quote(process.execPath)} -ConfigPath ${quote(configFile)}\ncodex\nexit $LASTEXITCODE\n`);
function wt(name,args){const r=spawnSync('wt.exe',['-w',name,...args],{encoding:'utf8',windowsHide:false,timeout:10000});if(r.status!==0)throw Error(r.stderr||'Owned test Terminal launch failed');}
function inspect(title,capture){const args=['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(product,'scripts/inspect-test-window.ps1'),'-Title',title];if(capture)args.push('-CaptureFile',capture);const r=spawnSync('powershell.exe',args,{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout.replace(/^\uFEFF/,''));}
function descriptor(role){const record=readHost(roles.get(role).host);return readLaunch(record.launchFile);}
function command(role,args,allow=false){const origin=readHost(roles.get(role).host).proof.origin,env={...process.env,TMUX:origin.tmux,TMUX_PANE:origin.pane,PSMUX_SESSION:origin.session,PSMUX_DATA_DIR:origin.dataDir,PSMUX_CONFIG_FILE:path.join(origin.dataDir,'host.conf')};delete env.PSMUX_TARGET_SESSION;delete env.PSMUX_TARGET_FULL;const r=spawnSync(binary,['-L',origin.namespace,...args],{env,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});if(!allow&&r.status!==0)throw Error(r.stderr);return r;}
async function bind(role,percent,id='synthetic-ui-'+role){
 const transcript=path.join(root,role+'-'+id+'.jsonl'),request=path.join(root,'request-'+role+'.json'),result=path.join(root,'result-'+role+'.json'),row=(type,payload)=>JSON.stringify({type,payload})+'\n';
 fs.writeFileSync(transcript,row('session_meta',{id,cwd:path.join(root,'samecwd'),source:'cli'})+row('event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:percent*1000,cached_input_tokens:0,output_tokens:0,total_tokens:percent*1000},model_context_window:100000}}));
 fs.writeFileSync(request,JSON.stringify({hook_event_name:'SessionStart',source:'resume',session_id:id,transcript_path:transcript}));if(fs.existsSync(result))fs.unlinkSync(result);
 const response=await wait(()=>fs.existsSync(result)?read(result):undefined,'Hook result missing '+role);assert.equal(response.code,0);assert.equal(response.stderr,'');
 await wait(()=>descriptor(role).sessionId===id&&command(role,['capture-pane','-p','-t',descriptor(role).host.hudPane]).stdout.includes(percent+'%'),'Telemetry did not bind '+role);fs.unlinkSync(request);
}
try{
 const tab=(role,shell)=>['new-tab','--title',titles[role],'--suppressApplicationTitle',shell,'-NoLogo','-NoProfile','-File',boot,'-Role',role];
 if(previewOnly){
  wt(names.tabs,['--size','100,32',...tab('A','pwsh.exe')]);roles.set('A',await wait(()=>fs.existsSync(path.join(root,'ready-A.json'))?read(path.join(root,'ready-A.json')):undefined,'Preview fixture did not start'));
  await bind('A',20);inspect(titles.A,path.join(root,'preview.png'));console.log(JSON.stringify({verdict:'PREVIEW_ONLY',root,host:roles.get('A').host,title:titles.A,binary,expiresAfterMinutes:30},null,2));
 }else{
 wt(names.tabs,['--size','120,42',...tab('A','powershell.exe'),';',...tab('B','pwsh.exe')]);
 for(const role of ['A','B'])roles.set(role,await wait(()=>fs.existsSync(path.join(root,'ready-'+role+'.json'))?read(path.join(root,'ready-'+role+'.json')):undefined,'PowerShell entry did not start fixture '+role));
 assert.notEqual(descriptor('A').file,descriptor('B').file);const initial=inspect(titles.B);assert.equal(initial.tabs.length,2);assert.ok(initial.tabs.some(t=>t.name===titles.B&&t.selected));checks.push('PS5 and PS7 bare codex entries create two independent HUDs in real WT tabs');
 await bind('A',20);await bind('B',70);const bBefore=command('B',['display-message','-p','-t','%1','#{pane_width}|#{pane_height}']).stdout;
 requestStop(descriptor('A').file);await wait(()=>descriptor('A').state==='exited','Old A HUD did not stop');await delay(600);await bind('A',20,'synthetic-ui-reopened-A');
 assert.equal(command('B',['display-message','-p','-t','%1','#{pane_width}|#{pane_height}']).stdout,bBefore);const visibleB=inspect(titles.B,path.join(root,'tab-B.png'));assert.ok(visibleB.tabs.some(t=>t.name===titles.B&&t.selected));assert.ok(visibleB.text.includes('70%')&&!visibleB.text.includes('20%'));checks.push('B remains selected while background A recreates its exact HUD; B geometry unchanged');
 wt(names.tabs,['focus-tab','--target','0']);await wait(()=>inspect(titles.A).text.includes('20%'),'A text is not visible');inspect(titles.A,path.join(root,'tab-A.png'));
 for(const role of ['C','D']){wt(names[role],['--size','100,35',...tab(role,role==='C'?'powershell.exe':'pwsh.exe')]);roles.set(role,await wait(()=>fs.existsSync(path.join(root,'ready-'+role+'.json'))?read(path.join(root,'ready-'+role+'.json')):undefined,'Separate PowerShell window did not start '+role));await bind(role,role==='C'?35:65);}
 for(const role of ['C','D']){const expected=role==='C'?'35%':'65%',actual=inspect(titles[role],path.join(root,'window-'+role+'.png'));assert.equal(actual.tabs.length,1);assert.ok(actual.text.includes(expected));}
 checks.push('two separately opened PowerShell windows each run bare codex with their own HUD (PS5/PS7)');
 wt(names.split,['--size','140,40','new-tab','--title',splitTitle,'--suppressApplicationTitle','powershell.exe','-NoLogo','-NoProfile','-File',boot,'-Role','L',';','split-pane','--vertical','--size','0.5','--title',splitTitle,'--suppressApplicationTitle','pwsh.exe','-NoLogo','-NoProfile','-File',boot,'-Role','R']);
 for(const role of ['L','R'])roles.set(role,await wait(()=>fs.existsSync(path.join(root,'ready-'+role+'.json'))?read(path.join(root,'ready-'+role+'.json')):undefined,'Native split fixture did not start '+role));
 await bind('L',25);await bind('R',75);const nativeBefore=inspect(splitTitle),rightBefore=nativeBefore.panes.find(p=>p.text.includes('SYNTHETIC CODEX R'));assert.equal(nativeBefore.panes.length,2);assert.ok(rightBefore?.focused);
 requestStop(descriptor('L').file);await wait(()=>descriptor('L').state==='exited','Left HUD did not close');await delay(600);await bind('L',25,'synthetic-ui-reopened-L');
 const nativeAfter=inspect(splitTitle,path.join(root,'native-split.png')),left=nativeAfter.panes.find(p=>p.text.includes('SYNTHETIC CODEX L')),right=nativeAfter.panes.find(p=>p.text.includes('SYNTHETIC CODEX R'));
 assert.ok(left?.text.includes('25%')&&!left.text.includes('75%'));assert.ok(right?.text.includes('75%')&&!right.text.includes('25%'));assert.ok(right.focused);for(const key of ['left','top','width','height'])assert.equal(right[key],rightBefore[key]);
 checks.push('native WT split preserves active right neighbour geometry/focus while left recreates its own HUD');
 const summary={verdict:'PASS_SYNTHETIC_DESKTOP_ENTRY',root,ownedWindows:names,titles,checks,limitations:['Synthetic npm package and renamed Node codex.exe fixture; not official Codex trust/daemon/input acceptance.']};fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
 }
}catch(error){console.error(JSON.stringify({root,error:error.message}));process.exitCode=1;}
finally{
 for(const role of allRoles)if(!previewOnly||role!=='A')fs.writeFileSync(path.join(root,'stop-'+role),'stop');
 await delay(1500);
 for(const [role,ready]of roles){if(previewOnly&&role==='A')continue;try{const record=readHost(ready.host);if(record.state==='running')command(role,['kill-session','-t','codex'],true);}catch{}}
}
