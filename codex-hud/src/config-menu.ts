import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {definitions,get,loadConfig,preset,saveConfig,set,type Config} from './config.js';
export async function configure(file:string,preview:(config:Config)=>string[]=()=>[]):Promise<boolean> {
 if(!stdin.isTTY)throw new Error('交互配置需要终端；可使用 config set');
 const rl=createInterface({input:stdin,output:stdout});let config=loadConfig(file);
 try {
  for(;;) {
   console.log('\nCodex HUD 配置 | 1 布局  2 显示项  3 Git  4 颜色  5 终端  6 预设  p 预览  s 保存  q 取消');
   const answer=(await rl.question('> ')).trim();
   if(answer==='q')return false;if(answer==='s'){saveConfig(file,config);return true;}
   if(answer==='p'){console.log(preview(config).join('\n'));continue;}
   if(answer==='6'){const choice=await rl.question('full / essential / minimal: ');try{config=preset(choice.trim(),config);}catch(e){console.error((e as Error).message);}continue;}
   const section=({'1':'layout','2':'display','3':'git','4':'colors','5':'terminal'} as Record<string,string>)[answer];if(!section)continue;
   const options=definitions.filter(d=>d.section===section);
   options.forEach((d,i)=>console.log((i+1)+'. '+d.label+' = '+JSON.stringify(get(config,d.key))+(d.reason?' [不可用: '+d.reason+']':'')));
   const choice=Number(await rl.question('选择序号（回车返回）: '));const d=options[choice-1];if(!d)continue;
   if(d.reason){console.log(d.reason);continue;}
   try {
    const current=get(config,d.key);
    if(d.kind==='boolean')config=set(config,d.key,!current);
    else{const raw=await rl.question(d.key+' 新值'+(d.choices?' '+JSON.stringify(d.choices):'')+': ');let value:unknown=raw;try{value=JSON.parse(raw);}catch{}config=set(config,d.key,value);}
    console.log(preview(config).join('\n'));
   }catch(e){console.error((e as Error).message);}
  }
 }finally{rl.close();}
}

