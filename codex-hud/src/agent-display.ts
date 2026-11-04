import {sanitize} from './terminal-text.js';
import type {Agent} from './types.js';

export function agentRows(agents:Agent[],language:string,now:number,maximum:number):string[]{
 const label=(en:string,zh:string,tw=zh)=>language==='en'?en:language==='zh-Hant'?tw:zh;
 const active=(a:Agent)=>['starting','running'].includes(a.status),unknown=(a:Agent)=>['unknown','unreported'].includes(a.status),last=(rows:Agent[],n:number)=>n>0?rows.slice(-n):[];
 const running=agents.filter(active),uncertain=agents.filter(unknown),recent=agents.filter(a=>!active(a)&&!unknown(a)&&(a.endedAt===undefined||Number.isFinite(a.endedAt)&&a.endedAt<=now&&now-a.endedAt<=60000)).sort((a,b)=>(a.endedAt??-Infinity)-(b.endedAt??-Infinity));
 const limit=Math.trunc(maximum)||agents.length,working=last(running,limit),unreported=last(uncertain,limit-working.length),live=[...working,...unreported],ended=last(recent,Math.min(2,Math.max(0,limit-live.length)));
 const statuses:Record<string,string>={starting:label('starting','启动中','啟動中'),running:label('running','运行中','執行中'),interrupted:label('interrupted','已中断','已中斷'),done:label('done','已完成'),failed:label('failed','失败','失敗'),closed:label('closed','已关闭','已關閉'),'not-found':label('not found','未找到')};
 const rows=[...live,...ended].map(a=>{
  let elapsed=label('time not reported','耗时未报告','耗時未回報');
  const end=active(a)?now:a.endedAt;
  if(Number.isFinite(a.startedAt)&&Number.isFinite(end)&&end!>=a.startedAt!){const seconds=Math.floor((end!-a.startedAt!)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);elapsed=hours?hours+'h '+minutes+'m':minutes?minutes+'m '+seconds%60+'s':seconds+'s';}
  const n=a.totalTokens,compact=n===undefined?'':n>=1000000?(n/1000000).toFixed(1).replace(/\.0$/,'')+'M':n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
  const tokens=Number.isFinite(n)&&n!>=0?'Σ'+compact+' tokens':label('tokens not reported','token 未报告','token 未回報');
  const icon=active(a)?'◐':unknown(a)?'?':a.status==='failed'?'✗':'✓';
  return icon+' '+sanitize(a.name)+' ['+(statuses[a.status]??label('status not reported','状态未报告','狀態未回報'))+']'+(a.action?' '+sanitize(a.action):'')+' ('+sanitize(a.model??label('model not reported','模型未报告','模型未回報'))+') | '+elapsed+' | '+tokens;
 });
 if(running.length>working.length)rows.push('+'+(running.length-working.length)+' '+label('running','运行中','執行中'));
 if(uncertain.length>unreported.length)rows.push('+'+(uncertain.length-unreported.length)+' '+label('status not reported','状态未报告','狀態未回報'));
 if(rows.length)rows[0]=label('Agents: ','子代理: ')+rows[0];return rows;
}
