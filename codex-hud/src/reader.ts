import fs from 'node:fs/promises';
import {StringDecoder} from 'node:string_decoder';
import {emptySnapshot,type HudSnapshot,type Tokens} from './types.js';
const MAX_LINE=2*1024*1024;
const safe=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function count(v:unknown):number{return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;}
function tokens(v:any):Tokens{return {input:count(v.input_tokens),cached:count(v.cached_input_tokens),output:count(v.output_tokens),reasoning:count(v.reasoning_output_tokens),total:typeof v.total_tokens==='number'?count(v.total_tokens):count(v.input_tokens)+count(v.output_tokens)};}
function text(v:unknown,max=200):string|undefined{return typeof v==='string'?v.slice(0,max):undefined;}
function parse(v:unknown):any{if(typeof v!=='string'||v.length>MAX_LINE)return null;try{return JSON.parse(v);}catch{return null;}}

export class SessionReader {
 private offset=0;private identity='';private mtime=0;private carry='';private decoder=new StringDecoder('utf8');
 private snapshot:HudSnapshot;private mismatch=false;private absolute=false;private discard=false;
 constructor(public readonly file:string,public readonly sessionId:string){this.snapshot=emptySnapshot(sessionId);}
 private reset(){this.offset=0;this.carry='';this.decoder=new StringDecoder('utf8');this.snapshot=emptySnapshot(this.sessionId);this.mismatch=false;this.absolute=false;this.discard=false;}
 async read():Promise<HudSnapshot>{
  const handle=await fs.open(this.file,'r');
  try {
   const stat=await handle.stat();const identity=stat.dev+':'+stat.ino+':'+stat.birthtimeMs;
   if(identity!==this.identity||stat.size<this.offset||(stat.mtimeMs!==this.mtime&&stat.size===this.offset&&this.offset>0))this.reset();
   this.identity=identity;this.mtime=stat.mtimeMs;
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
  if((p.session_id&&p.session_id!==this.sessionId)||(p.thread_id&&p.thread_id!==this.sessionId))return;
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
   case 'turn_aborted':this.snapshot.status='interrupted';for(const t of this.snapshot.tools)if(t.status==='running')t.status='failed';return;
   case 'context_compacted':case 'compact_boundary':this.snapshot.compactions++;return;
   case 'item_completed':if(safe(p.item))this.item(p.item,record.timestamp);return;
   case 'subagent_started':case 'agent_started':{
    const id=text(p.agent_id??p.thread_id);if(id)this.agent(id,text(p.name??p.agent_name)??id,'unknown');return;
   }
   case 'subagent_stopped':case 'agent_completed':{const id=text(p.agent_id??p.thread_id);if(id)this.agent(id,text(p.name)??id,p.success===false?'failed':'done');return;}
  }
 }
 private agent(id:string,name:string,status:string){const existing=this.snapshot.agents.find(a=>a.id===id);if(existing)existing.status=status;else this.snapshot.agents.push({id,name,status});this.snapshot.agents=this.snapshot.agents.slice(-64);}
 private item(p:any,timestamp:unknown){
  if(!safe(p))return;
  if(['function_call','custom_tool_call'].includes(p.type)){
   const id=text(p.call_id??p.id);const name=text(p.name);if(!id||!name||this.snapshot.tools.some(t=>t.id===id))return;
   this.snapshot.tools.push({id,name,status:'running'});this.snapshot.tools=this.snapshot.tools.slice(-64);
   const m=name.match(/^mcp__([^_].*?)__/);if(m&&!this.snapshot.mcpUsed.includes(m[1]))this.snapshot.mcpUsed.push(m[1]);
   const leaf=name.split('.').at(-1);
   if(leaf==='update_plan'){const args=parse(p.arguments??p.input);if(Array.isArray(args?.plan))this.snapshot.todos=args.plan.filter(safe).filter((x:any)=>typeof x.step==='string'&&['pending','in_progress','completed'].includes(x.status)).slice(0,200).map((x:any)=>({step:x.step.slice(0,200),status:x.status}));}
   if(leaf==='spawn_agent'){const args=parse(p.arguments??p.input);this.agent(id,text(args?.task_name)??text(args?.agent_type)??'agent','unknown');}
  }
  if(['function_call_output','custom_tool_call_output'].includes(p.type)){
   const id=text(p.call_id);const tool=this.snapshot.tools.find(t=>t.id===id);if(tool){const output=typeof p.output==='string'?parse(p.output):p.output;tool.status=p.is_error||output?.isError||output?.error||typeof output?.exit_code==='number'&&output.exit_code!==0?'failed':'done';}
  }
  if(p.type==='compaction')this.snapshot.compactions++;
  if(p.type==='message'&&p.role==='assistant')this.snapshot.lastResponseAt=text(timestamp);
 }
}

