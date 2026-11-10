import type {Tool,ToolAction} from './types.js';
import {sanitize} from './terminal-text.js';

const agentOperations=new Map<string,ToolAction['kind']>([['spawn_agent','agentSpawn'],['followup_task','agentFollowup'],['send_message','agentMessage'],['interrupt_agent','agentInterrupt'],['resume_agent','agentResume'],['close_agent','agentClose'],['wait_agent','agentWait']]);
export function isAgentAction(action:Tool['action']):boolean{return !!action&&action.kind.startsWith('agent');}

function basename(value:unknown):string|undefined {
 if(typeof value!=='string')return;
 const name=value.replaceAll('\\','/').split('/').at(-1)??'';
 if(!/^[\p{L}\p{N}_.() -]{1,64}$/u.test(name)||/^(?:ghp_|github_pat_|sk-)/i.test(name))return;
 return name;
}

/** Keep only a category and safe basename, never raw commands or arguments. */
export function commandDetails(command:unknown,actions?:unknown):ToolAction|undefined {
 if(Array.isArray(actions))for(const action of actions){
  if(!action||!['read','search','list'].includes(action.type))continue;
  const target=basename(action.path);return {kind:action.type,...(target?{target}:{})};
 }
 let args:string[];
 if(Array.isArray(command)&&command.every(value=>typeof value==='string'))args=command.slice(0,32);
 else if(typeof command==='string'){
  if(/[\r\n;&|<>`]/.test(command))return;
  args=[...command.slice(0,2048).matchAll(/"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s]+)/g)].slice(0,32).map(m=>m[1]??m[2]??m[3]);
 }else return;
 const executable=(args.shift()??'').replaceAll('\\','/').split('/').at(-1)?.toLowerCase().replace(/\.(?:exe|cmd|ps1)$/,'');
 if(executable==='node')return {kind:args[0]==='--test'?'nodeTest':'node'};
 if(executable==='npm'){
  if(args[0]==='test'||args[0]==='run'&&args[1]==='test')return {kind:'npmTest'};
  if(args[0]==='run'&&args[1]==='build')return {kind:'build'};
 }
 if(executable==='python'||executable==='python3'||executable==='py')return {kind:args[0]==='-m'&&args[1]==='pytest'?'pythonTest':'python'};
 if(executable==='git'){
  let index=0;while(args[index]==='-C')index+=2;
  const verb=args[index],target=['status','diff','log','show','add','commit','fetch','push','merge','rev-parse','ls-remote'].includes(verb)?verb:undefined;
  return {kind:'git',...(target?{target}:{})};
 }
 if(executable==='powershell'||executable==='pwsh')return {kind:'powershell'};
 if(executable==='bash'||executable==='sh')return {kind:'shell'};
}

export function toolDetails(name:string,args?:any):Pick<Tool,'mcp'|'action'> {
 const mcp=/^(?:functions\.)?mcp__(.+?)__(.+)$/.exec(name);
 if(mcp)return {mcp:{server:mcp[1].slice(0,200),tool:mcp[2].slice(0,200)}};
 const operation=agentOperations.get(name.replace(/^collaboration\./,''));
 if(operation){
  const value=operation==='agentSpawn'?args?.task_name??args?.agent_type:args?.target??args?.agent_id??args?.id;
  const target=typeof value==='string'?sanitize(value).slice(0,200):'';
  return {action:{kind:operation,...(target?{target}:{})}};
 }
 if(['exec_command','functions.exec_command'].includes(name)){
  const action=commandDetails(args?.cmd);return action?{action}:{};
 }
 if(['apply_patch','functions.apply_patch'].includes(name)){
  const matches=typeof args==='string'&&args.length<=8192?[...args.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)]:[];
  const target=matches.length===1?basename(matches[0][1]):undefined;
  return {action:{kind:'patch',...(target?{target}:{})}};
 }
 return {};
}
