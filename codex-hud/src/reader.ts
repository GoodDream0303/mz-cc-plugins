import fs, {type FileHandle} from 'node:fs/promises';
import {StringDecoder} from 'node:string_decoder';
import {createHash} from 'node:crypto';
import {emptySnapshot,type HudSnapshot,type Tokens,type Tool} from './types.js';
import {AgentTracker} from './agents.js';
import {toolOutput} from './tool-output.js';
const MAX_LINE=2*1024*1024;
const safe=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function count(v:unknown):number{return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;}
function tokens(v:any):Tokens{return {input:count(v.input_tokens),cached:count(v.cached_input_tokens),output:count(v.output_tokens),reasoning:count(v.reasoning_output_tokens),total:typeof v.total_tokens==='number'?count(v.total_tokens):count(v.input_tokens)+count(v.output_tokens)};}
function text(v:unknown,max=200):string|undefined{return typeof v==='string'?v.slice(0,max):undefined;}
function parse(v:unknown):any{if(typeof v!=='string'||v.length>MAX_LINE)return null;try{return JSON.parse(v);}catch{return null;}}
interface Checkpoint {start:number;length:number;digest:string}
async function fingerprint(handle:FileHandle,start:number,length:number):Promise<string>{
 const bytes=Buffer.alloc(length);let used=0;
 while(used<length){const {bytesRead}=await handle.read(bytes,used,length-used,start+used);if(!bytesRead)break;used+=bytesRead;}
 return used+':'+createHash('sha256').update(bytes.subarray(0,used)).digest('hex');
}

export class SessionReader {
 private offset=0;private identity='';private mtime=0;private carry='';private decoder=new StringDecoder('utf8');
 private snapshot:HudSnapshot;private agents:AgentTracker;private mismatch=false;private absolute=false;private discard=false;private canonicalCompleted=new Set<string>();
 private prefix?:Checkpoint;private checkpoint?:Checkpoint;
 private canonicalTools=new Set<string>();private processTools=new Map<string,string>();private pollTargets=new Map<string,string>();
 constructor(public readonly file:string,public readonly sessionId:string){this.snapshot=emptySnapshot(sessionId);this.agents=new AgentTracker(this.snapshot.agents,sessionId);}
 private reset(){this.offset=0;this.carry='';this.decoder=new StringDecoder('utf8');this.snapshot=emptySnapshot(this.sessionId);this.agents=new AgentTracker(this.snapshot.agents,this.sessionId);this.mismatch=false;this.absolute=false;this.discard=false;this.canonicalCompleted.clear();this.canonicalTools.clear();this.processTools.clear();this.pollTargets.clear();this.prefix=undefined;this.checkpoint=undefined;}
 private async unchanged(handle:FileHandle):Promise<boolean>{
  for(const point of [this.prefix,this.checkpoint])if(point&&await fingerprint(handle,point.start,point.length)!==point.digest)return false;
  return true;
 }
 async read():Promise<HudSnapshot>{
  const handle=await fs.open(this.file,'r');
  try {
   const stat=await handle.stat();const identity=stat.dev+':'+stat.ino+':'+stat.birthtimeMs;
   if(identity!==this.identity||stat.size<this.offset||(stat.mtimeMs!==this.mtime&&stat.size===this.offset&&this.offset>0))this.reset();
   if(this.offset&&!await this.unchanged(handle))this.reset();
   this.identity=identity;this.mtime=stat.mtimeMs;
   const prefixLength=Math.min(stat.size,4096),before=await fingerprint(handle,0,prefixLength);
   const buffer=Buffer.alloc(64*1024);
   while(this.offset<stat.size){
    const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,stat.size-this.offset),this.offset);if(!bytesRead)break;
    this.offset+=bytesRead;this.carry+=this.decoder.write(buffer.subarray(0,bytesRead));
    let end:number;while((end=this.carry.indexOf('\n'))>=0){
     const line=this.carry.slice(0,end);this.carry=this.carry.slice(end+1);
     if(this.discard){this.discard=false;continue;}if(line.length>MAX_LINE){this.error('oversized record ignored');continue;}
     try{this.apply(JSON.parse(line));}catch{/* a partially damaged record does not invalidate earlier telemetry */}
    }
    if(this.carry.length>MAX_LINE){this.carry='';this.discard=true;this.error('oversized record ignored');}
   }
   // Hash anchors, not raw log text, are retained. Revalidate across the read too.
   if(await fingerprint(handle,0,prefixLength)!==before||!await this.unchanged(handle)){
    this.reset();this.error('Session log changed during read; retrying');return structuredClone(this.snapshot);
   }
   const length=Math.min(this.offset,4096),start=this.offset-length;
   this.prefix={start:0,length:prefixLength,digest:before};
   this.checkpoint={start,length,digest:await fingerprint(handle,start,length)};
   return structuredClone(this.snapshot);
  }finally{await handle.close();}
 }
 private error(message:string){if(!this.snapshot.errors.includes(message))this.snapshot.errors.push(message);this.snapshot.errors=this.snapshot.errors.slice(-5);}
 private apply(record:any){
  if(!safe(record)||!safe(record.payload))return;const p=record.payload;const type=record.type;
  if(type==='session_meta'){
   const id=p.id??p.session_id;if(id&&id!==this.sessionId){this.mismatch=true;this.snapshot=emptySnapshot(this.sessionId);this.error('session identity mismatch');return;}
   this.snapshot.cwd=text(p.cwd,32768);this.snapshot.startedAt=text(p.timestamp??record.timestamp);this.snapshot.version=text(p.cli_version);this.snapshot.sessionName=text(p.title??p.name??p.slug);return;
  }
  if(this.mismatch)return;
  if(p.session_id&&p.session_id!==this.sessionId)return;
  if(type==='event_msg'&&this.agents.event(p))return;
  if(p.thread_id&&p.thread_id!==this.sessionId)return;
  if(type==='turn_context'){
   this.snapshot.model=text(p.model);this.snapshot.effort=text(p.effort??p.reasoning_effort);
   if(typeof p.cwd==='string')this.snapshot.cwd=text(p.cwd,32768);
   if(typeof p.model_provider==='string')this.snapshot.provider=text(p.model_provider);return;
  }
  if(type==='token_usage_record'&&!this.absolute){const usage=p.thread_token_usage;if(safe(usage))this.snapshot.totals=tokens(usage);return;}
  if(type==='response_item'){this.item(p,record.timestamp);return;}
  if(type!=='event_msg')return;
  switch(p.type){
   case 'token_count':{
    if(safe(p.info)){
     if(safe(p.info.total_token_usage)){this.snapshot.totals=tokens(p.info.total_token_usage);this.absolute=true;}
     if(safe(p.info.last_token_usage)){this.snapshot.latest=tokens(p.info.last_token_usage);const window=count(p.info.model_context_window);if(window>0)this.snapshot.context={used:this.snapshot.latest.total,window};}
    }
    if(safe(p.rate_limits)){
     const limits=p.rate_limits;const quotas:HudSnapshot['quotas']=[];
     for(const key of ['primary','secondary']){
      const q=limits[key];if(!safe(q)||typeof q.used_percent!=='number'||!Number.isFinite(q.used_percent)||!q.window_minutes)continue;
      quotas.push({id:String(limits.limit_id??'codex')+':'+key,minutes:count(q.window_minutes),usedPercent:Math.max(0,Math.min(100,q.used_percent)),resetsAt:typeof q.resets_at==='number'?q.resets_at:undefined});
     }
     this.snapshot.quotas=quotas;if(typeof limits.plan_type==='string')this.snapshot.plan=text(limits.plan_type);
    }return;
   }
   case 'task_started':this.snapshot.status='working';return;
   case 'task_complete':this.snapshot.status='idle';this.snapshot.lastResponseAt=text(p.completed_at??record.timestamp);return;
   case 'turn_aborted':this.snapshot.status='interrupted';for(const t of this.snapshot.tools)if(t.status==='running'){t.status='cancelled';this.canonicalCompleted.add(t.id);}return;
   case 'context_compacted':case 'compact_boundary':this.snapshot.compactions++;return;
   case 'item_started':if(safe(p.item))this.item(p.item,record.timestamp);return;
   case 'item_completed':if(safe(p.item))this.item(p.item,record.timestamp,true);return;
  }
 }
 private tool(id:string,name:string,status:Tool['status'],canonical=false){
  const previous=this.snapshot.tools.find(t=>t.id===id);
  if(previous){if(!this.canonicalCompleted.has(id)&&(canonical||previous.status==='running')){previous.name=name;previous.status=status;}}
  else this.snapshot.tools.push({id,name,status});
  if(canonical){this.canonicalTools.add(id);if(status!=='running')this.canonicalCompleted.add(id);}
  const live=this.snapshot.tools.filter(t=>t.status==='running').slice(-64),finished=this.snapshot.tools.filter(t=>t.status!=='running');
  const retained=new Set([...live,...(live.length<64?finished.slice(-(64-live.length)):[])].map(t=>t.id));this.snapshot.tools=this.snapshot.tools.filter(t=>retained.has(t.id));
  for(const set of [this.canonicalCompleted,this.canonicalTools])for(const key of set)if(!retained.has(key))set.delete(key);
  for(const [key,value]of this.processTools)if(!retained.has(value))this.processTools.delete(key);
  while(this.processTools.size>128)this.processTools.delete(this.processTools.keys().next().value!);
  while(this.pollTargets.size>128)this.pollTargets.delete(this.pollTargets.keys().next().value!);
 }
 private item(p:any,timestamp:unknown,completed=false){
  if(!safe(p))return;
  if(p.type==='SubAgentActivity'){this.agents.event({...p,type:'sub_agent_activity'});return;}
  if(p.type==='McpToolCall'||p.type==='CommandExecution'||p.type==='Extension'){
   let id=text(p.id??p.call_id);if(!id)return;
   let name=p.type==='Extension'?text(p.kind):'exec_command';if(!name)return;
   if(p.type==='McpToolCall'){const server=text(p.server),tool=text(p.tool);if(!server||!tool)return;name='mcp__'+server+'__'+tool;if(!this.snapshot.mcpUsed.includes(server))this.snapshot.mcpUsed.push(server);}
   if(p.type==='CommandExecution'&&p.process_id!==undefined&&p.process_id!==null){const key='session:'+String(p.process_id);if(p.source!=='unified_exec_startup')id=this.processTools.get(key)??id;this.processTools.set(key,id);}
   const failed=p.status==='failed'||!!p.error||typeof p.exit_code==='number'&&p.exit_code!==0,cancelled=['cancelled','aborted','interrupted','declined'].includes(p.status),running=['in_progress','inProgress','running'].includes(p.status);
   this.tool(id,name,cancelled?'cancelled':failed?'failed':running?'running':completed||p.status==='completed'?'done':'running',true);return;
  }
  if(['function_call','custom_tool_call'].includes(p.type)){
   const id=text(p.call_id??p.id);const name=text(p.name);if(!id||!name||this.snapshot.tools.some(t=>t.id===id))return;
   this.tool(id,name,'running');
   const m=name.match(/^mcp__([^_].*?)__/);if(m&&!this.snapshot.mcpUsed.includes(m[1]))this.snapshot.mcpUsed.push(m[1]);
   const leaf=name.split('.').at(-1);
   const args=parse(p.arguments??p.input);
   if(leaf==='update_plan'&&Array.isArray(args?.plan))this.snapshot.todos=args.plan.filter(safe).filter((x:any)=>typeof x.step==='string'&&['pending','in_progress','completed'].includes(x.status)).slice(0,200).map((x:any)=>({step:x.step.slice(0,200),status:x.status}));
   if(['write_stdin','wait'].includes(leaf??'')){const key=args?.cell_id!==undefined?'cell:'+String(args.cell_id):'session:'+String(args?.session_id),target=this.processTools.get(key);if(target)this.pollTargets.set(id,target);}
   this.agents.call(id,leaf??'',args);
  }
  if(['function_call_output','custom_tool_call_output'].includes(p.type)){
   const id=text(p.call_id),tool=this.snapshot.tools.find(t=>t.id===id);if(tool&&!this.canonicalCompleted.has(tool.id)){
    const metadata=toolOutput(p.output),output=metadata.data,leaf=tool.name.split('.').at(-1),executor=['exec','exec_command','write_stdin','wait'].includes(leaf??'');
    const failed=!!(p.is_error||output?.isError||output?.error)||metadata.exitCode!==undefined&&metadata.exitCode!==0||executor&&metadata.status==='failed';
    const pending=metadata.cellId!==undefined?'cell:'+metadata.cellId:metadata.sessionId!==undefined?'session:'+metadata.sessionId:undefined,poll=this.pollTargets.get(tool.id),processTool=poll?this.snapshot.tools.find(t=>t.id===poll):undefined;
    if(pending&&!failed&&metadata.exitCode===undefined&&['exec','exec_command'].includes(leaf??''))this.processTools.set(pending,tool.id);
    if(!this.canonicalTools.has(tool.id))tool.status=failed?'failed':!poll&&pending&&this.processTools.get(pending)===tool.id?'running':'done';
    if(processTool&&(metadata.exitCode!==undefined||executor&&metadata.status&&metadata.status!=='running'))this.tool(processTool.id,processTool.name,failed?'failed':'done');
    while(this.processTools.size>128)this.processTools.delete(this.processTools.keys().next().value!);
    this.pollTargets.delete(tool.id);this.agents.result(tool.id,output,failed);
   }
  }
  if(p.type==='compaction')this.snapshot.compactions++;
  if(p.type==='message'&&p.role==='assistant')this.snapshot.lastResponseAt=text(timestamp);
 }
}
