import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';import {defaultConfig,saveConfig,loadConfig,get,definitions} from '../dist/config.js';
async function menu(file,action){
 const entry=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href;
 const script="Object.defineProperty(process.stdin,'isTTY',{value:true});const {main}=await import("+JSON.stringify(entry)+");await main(['configure','--config',process.argv[1]]);";
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',script,file],{stdio:['pipe','pipe','pipe']});let output='',errors='',phase=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Menu interaction timeout: '+output));},5000);
  child.stdout.on('data',chunk=>{output+=chunk;
   if(phase===0&&output.includes('v Preview')){phase=1;child.stdin.write('2\n');}
   else if(phase===1&&output.includes('Select an item')){phase=2;child.stdin.write('1\n');}
   else if(phase===2&&(output.match(/Select an item/g)??[]).length>=2){phase=3;child.stdin.write(action+'\n');}
  });child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error(errors));else resolve(output);});
 });
}
for(const action of ['q','s'])test('interactive menu previews an English toggle and '+(action==='q'?'cancel preserves the file':'save persists the selected value'),async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-menu-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'config.json');saveConfig(file,defaultConfig());const before=fs.readFileSync(file,'utf8');const output=await menu(file,action);assert.match(output,/Context/);assert.ok(!/[\u3400-\u9fff]/.test(output));
 if(action==='q')assert.equal(fs.readFileSync(file,'utf8'),before);else assert.equal(get(loadConfig(file),'display.showModel'),true);
});
test('Startup menu enables exact-host opening while preserving the paused legacy flag',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-menu-host-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'config.json'),config=defaultConfig();config.startup.enabled=false;saveConfig(file,config);
 const entry=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href,script=`Object.defineProperty(process.stdin,'isTTY',{value:true});const {main}=await import(${JSON.stringify(entry)});await main(['configure','--config',process.argv[1]]);`;
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',script,file],{stdio:['pipe','pipe','pipe']});let output='',errors='',phase=0;const timer=setTimeout(()=>{child.kill();reject(Error('Startup menu timed out'));},5000);
  child.stdout.on('data',data=>{output+=data;
   if(phase===0&&output.includes('v Preview')){phase=1;child.stdin.write('7\n');}
   else if(phase===1&&output.includes('Select an item')){const choice=/^(\d+)\. Auto start =/mi.exec(output);if(!choice){clearTimeout(timer);child.kill();reject(Error('Exact-host startup option is missing: '+output));return;}phase=2;child.stdin.write(choice[1]+'\n');}
   else if(phase===2&&output.includes('host.autoStart new value')){phase=3;child.stdin.write('"enabled"\n');}
   else if(phase===3&&(output.match(/Select an item/g)??[]).length>=2){phase=4;child.stdin.write('s\n');}
  });child.stderr.on('data',data=>errors+=data);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(errors||'Startup menu failed'));});
 });
 const saved=loadConfig(file);assert.equal(get(saved,'host.autoStart'),'enabled');assert.equal(get(saved,'startup.enabled'),false);
});

async function scriptedMenu(file,steps){
 const entry=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href;
 const script=`Object.defineProperty(process.stdin,'isTTY',{value:true});const {main}=await import(${JSON.stringify(entry)});await main(['configure','--config',process.argv[1]]);`;
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',script,file],{stdio:['pipe','pipe','pipe']});let output='',errors='',cursor=0,step=0;const screens=[];
  const timer=setTimeout(()=>{child.kill();reject(Error('Scripted menu timed out at '+step+': '+output));},10000);
  child.stdout.on('data',chunk=>{
   output+=chunk;
   if(step<steps.length){const match=steps[step][0].exec(output.slice(cursor));if(match){const screen=output.slice(cursor,cursor+match.index+match[0].length);screens.push(screen);cursor+=match.index+match[0].length;const response=typeof steps[step][1]==='function'?steps[step][1](screen):steps[step][1];child.stdin.write(response+'\n');step++;}}
  });
  child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);
  child.on('exit',code=>{clearTimeout(timer);code===0&&step===steps.length?resolve({output,errors,screens}):reject(Error(errors||'Menu stopped before finishing its steps'));});
 });
}
const mainPrompt=/(?:^|\n)> $/;
const itemPrompt=/(?:Select an item|选择选项|選擇選項)[^\n]*[:：] $/;
const selectKey=key=>screen=>{const row=screen.split('\n').find(line=>line.includes('('+key+')')),match=row&&/^(\d+)\./.exec(row);assert.ok(match,key+' must be on the current page');return match[1];};
function fixture(t,language='en'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-menu-locale-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'config.json'),config=defaultConfig();config.language=language;config.future={keep:'用户原文'};saveConfig(file,config);return file;
}

for(const [language,label]of [['zh-Hans','布局'],['zh-Hant','版面']])test('menu opens in '+language+' with option examples',async t=>{
 const file=fixture(t,language),before=fs.readFileSync(file,'utf8');
 const {output}=await scriptedMenu(file,[[mainPrompt,'1'],[itemPrompt,''],[mainPrompt,'q']]);
 assert.ok(output.includes(label));assert.match(output,/示例|範例/);assert.match(output,/语言|語言/);assert.equal(fs.readFileSync(file,'utf8'),before);
});

for(const action of ['q','s'])test('changing menu language is immediate and '+(action==='q'?'cancellable':'saved'),async t=>{
 const file=fixture(t),before=fs.readFileSync(file,'utf8');
 const {output}=await scriptedMenu(file,[[mainPrompt,'1'],[itemPrompt,'1'],[/language[^\n]*: $/,'zh-Hans'],[itemPrompt,action]]);
 assert.match(output,/v 预览/);assert.match(output,/保存/);assert.match(output,/取消/);
 if(action==='q')assert.equal(fs.readFileSync(file,'utf8'),before);else{assert.equal(get(loadConfig(file),'language'),'zh-Hans');assert.deepEqual(loadConfig(file).future,{keep:'用户原文'});}
});

test('Chinese value help shows an input example, bounds and localized invalid-value feedback',async t=>{
 const file=fixture(t,'zh-Hans');
 const {output,errors}=await scriptedMenu(file,[[mainPrompt,'5'],[itemPrompt,selectKey('terminal.refreshMs')],[/terminal\.refreshMs[^\n]*[:：] $/,'1'],[itemPrompt,'s']]);
 assert.match(output,/刷新间隔/);assert.match(output,/输入示例/);assert.match(output,/效果示例/);assert.match(output,/250/);assert.match(output,/60000/);assert.match(errors,/范围/);
 assert.equal(get(loadConfig(file),'terminal.refreshMs'),1000);
});

test('blank value keeps the draft and Display examples can be paged without changing values',async t=>{
 const file=fixture(t,'zh-Hans'),before=fs.readFileSync(file,'utf8');
 const {output}=await scriptedMenu(file,[[mainPrompt,'2'],[itemPrompt,'n'],[itemPrompt,'p'],[itemPrompt,''],[mainPrompt,'5'],[itemPrompt,selectKey('terminal.refreshMs')],[/terminal\.refreshMs[^\n]*[:：] $/,''],[itemPrompt,'q']]);
 assert.match(output,/下一页/);assert.match(output,/上一页/);assert.match(output,/\[2\/\d+\]/);assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('menus hide unavailable and inactive options while keeping their saved values',async t=>{
 const file=fixture(t,'zh-Hans'),config=loadConfig(file);config.display.showCost=true;config.startup.enabled=false;saveConfig(file,config);
 const {output}=await scriptedMenu(file,[[mainPrompt,'1'],[itemPrompt,''],[mainPrompt,'2'],[itemPrompt,'n'],[itemPrompt,'n'],[itemPrompt,'n'],[itemPrompt,'n'],[itemPrompt,'n'],[itemPrompt,''],[mainPrompt,'4'],[itemPrompt,'n'],[itemPrompt,''],[mainPrompt,'7'],[itemPrompt,'s']]);
 const hidden=[...definitions.filter(d=>d.reason).map(d=>d.key),'display.addedDirsLayout','display.authUserLength','display.environmentThreshold','colors.git','colors.usageWarning'];
 for(const key of hidden)assert.ok(!output.includes('('+key+')'),key+' must be hidden');
 const result=loadConfig(file);for(const key of hidden)assert.deepEqual(get(result,key),get(config,key),key+' must be preserved');
});

test('p returns to page one after editing on page two, keeping the selection and draft',async t=>{
 const file=fixture(t,'zh-Hans');
 const {screens}=await scriptedMenu(file,[[mainPrompt,'2'],[itemPrompt,'n'],[itemPrompt,selectKey('display.usageCompact')],[itemPrompt,'p'],[itemPrompt,'s']]);
 assert.match(screens[2],/\[2\/\d+\]/);assert.match(screens[3],/\[2\/\d+\]/);assert.match(screens[3],/usageCompact/);
 assert.match(screens[4],/\[1\/\d+\]/);assert.match(screens[4],/display\.showModel/);assert.equal(get(loadConfig(file),'display.usageCompact'),true);
});

test('page boundaries explain no movement and v previews without leaving the section',async t=>{
 const file=fixture(t,'zh-Hans'),before=fs.readFileSync(file,'utf8');
 const {output,screens}=await scriptedMenu(file,[[mainPrompt,'5'],[itemPrompt,'P'],[itemPrompt,'N'],[itemPrompt,'v'],[itemPrompt,'q']]);
 assert.match(output,/已是第一页/);assert.match(output,/已是最后一页/);assert.match(screens[4],/上下文/);assert.match(screens[4],/terminal\.refreshMs/);assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('main-menu p explains page navigation instead of silently running preview',async t=>{
 const file=fixture(t,'zh-Hans');
 const {screens}=await scriptedMenu(file,[[mainPrompt,'p'],[mainPrompt,'v'],[mainPrompt,'q']]);
 assert.match(screens[1],/请先进入分类再翻页/);assert.match(screens[2],/上下文/);
});

test('menu preview demonstrates both quota controls and honors independently disabled windows',async t=>{
 const file=fixture(t,'zh-Hans');let result=await scriptedMenu(file,[[mainPrompt,'v'],[mainPrompt,'q']]);
 assert.match(result.output,/5h:/);assert.match(result.output,/7d:/);
 const config=loadConfig(file);config.display.showFiveHourUsage=false;saveConfig(file,config);
 result=await scriptedMenu(file,[[mainPrompt,'v'],[mainPrompt,'q']]);assert.doesNotMatch(result.output,/5h:/);assert.match(result.output,/7d:/);
});

test('Chinese preset help preserves language, future settings and the legacy startup pause',async t=>{
 const file=fixture(t,'zh-Hans'),config=loadConfig(file);config.startup.enabled=false;config.host.autoStart='enabled';saveConfig(file,config);
 const {output}=await scriptedMenu(file,[[mainPrompt,'6'],[/预设[^\n]*： $/,'essential'],[mainPrompt,'s']]);
 assert.match(output,/essential：上下文、额度和会话 Token/);const result=loadConfig(file);
 assert.equal(result.language,'zh-Hans');assert.equal(result.startup.enabled,false);assert.equal(result.host.autoStart,'enabled');assert.deepEqual(result.future,config.future);
});
