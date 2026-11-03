import test from 'node:test';
import assert from 'node:assert/strict';
import {definitions,defaultConfig,set} from '../dist/config.js';

test('every configurable option has localized help and a valid input example',async()=>{
 const module=await import('../dist/menu-help.js').catch(()=>null);
 assert.equal(typeof module?.optionHelp,'function','Localized option help is missing');
 for(const definition of definitions){
  for(const language of ['en','zh-Hans','zh-Hant']){
   const help=module.optionHelp(definition,language);
   assert.ok(help.label&&help.effect,definition.key+' has incomplete help in '+language);
   assert.doesNotThrow(()=>set(defaultConfig(),definition.key,help.example),definition.key+' has an invalid example');
   if(language==='en')assert.ok(!/[\u3400-\u9fff]/.test(help.label+help.effect+help.unavailable));
   else assert.match(help.label,/[\u3400-\u9fff]/,definition.key+' needs a Chinese label');
   if(definition.reason)assert.ok(help.unavailable,definition.key+' must explain its unavailable status');
  }
 }
});

test('menu help explains canonical enum choices without changing their input values',async()=>{
 const module=await import('../dist/menu-help.js').catch(()=>null);
 assert.equal(typeof module?.optionHelp,'function','Localized option help is missing');
 for(const definition of definitions.filter(d=>d.choices)){
  const help=module.optionHelp(definition,'zh-Hans');
  assert.deepEqual(help.choices.map(c=>c.value),definition.choices);
  assert.ok(help.choices.every(c=>/[\u3400-\u9fff]/.test(c.label)),definition.key+' needs explained choices');
 }
});

test('choice descriptions distinguish full effort, model and path formats',async()=>{
 const module=await import('../dist/menu-help.js');
 const full=key=>module.optionHelp(definitions.find(d=>d.key===key),'zh-Hans').choices.find(c=>c.value==='full').label;
 assert.match(full('display.effortFormat'),/符号.*文本/);
 assert.match(full('display.modelFormat'),/模型/);
 assert.match(full('pathLevels'),/路径/);
});

test('quota window controls explain separate windows and missing metadata in both languages',async()=>{
 const {optionHelp}=await import('../dist/menu-help.js');
 for(const [key,en,zh] of [['display.showFiveHourUsage',/5.hour/i,/五小时/],['display.showSevenDayUsage',/7.day/i,/七天/]]){
  const definition=definitions.find(d=>d.key===key);assert.ok(definition,key+' is a configurable menu option');
  const english=optionHelp(definition,'en'),chinese=optionHelp(definition,'zh-Hans');
  assert.match(english.label,en);assert.match(chinese.label,zh);assert.match(english.effect,/metadata/);assert.match(chinese.effect,/数据/);
 }
});

test('Chinese effect examples use localized HUD labels and keep sample task names intact',async()=>{
 const module=await import('../dist/menu-help.js');
 const effect=(key,language='zh-Hans')=>module.optionHelp(definitions.find(d=>d.key===key),language).effect;
 assert.match(effect('display.showContextBar'),/上下文/);assert.match(effect('display.showSessionName'),/会话/);
 assert.match(effect('display.showTodos'),/待办.*Verify configuration/);assert.match(effect('display.showTodos','zh-Hant'),/待辦.*Verify configuration/);
});
