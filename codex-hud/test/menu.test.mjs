import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';import {defaultConfig,saveConfig,loadConfig,get} from '../dist/config.js';
async function menu(file,action){
 const entry=pathToFileURL(path.resolve(import.meta.dirname,'../dist/cli.js')).href;
 const script="Object.defineProperty(process.stdin,'isTTY',{value:true});const {main}=await import("+JSON.stringify(entry)+");await main(['configure','--config',process.argv[1]]);";
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',script,file],{stdio:['pipe','pipe','pipe']});let output='',errors='',phase=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Menu interaction timeout: '+output));},5000);
  child.stdout.on('data',chunk=>{output+=chunk;
   if(phase===0&&output.includes('p Preview')){phase=1;child.stdin.write('2\n');}
   else if(phase===1&&output.includes('Select an item')){phase=2;child.stdin.write('1\n');}
   else if(phase===2&&(output.match(/Codex HUD \|/g)??[]).length>=2){phase=3;child.stdin.write(action+'\n');}
  });child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error(errors));else resolve(output);});
 });
}
for(const action of ['q','s'])test('interactive menu previews an English toggle and '+(action==='q'?'cancel preserves the file':'save persists the selected value'),async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-menu-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'config.json');saveConfig(file,defaultConfig());const before=fs.readFileSync(file,'utf8');const output=await menu(file,action);assert.match(output,/Context/);assert.ok(!/[\u3400-\u9fff]/.test(output));
 if(action==='q')assert.equal(fs.readFileSync(file,'utf8'),before);else assert.equal(get(loadConfig(file),'display.showModel'),true);
});
