import WebSocket from 'ws';
import type {McpConnectionStatus,McpRuntimeSnapshot} from './types.js';

const statuses=new Set(['notStarted','starting','connected','authenticationRequired','failed','cancelled','disabled']);
const sessionPattern=/^[a-zA-Z0-9_-]{3,100}$/;
type Method='initialize'|'thread/loaded/list'|'mcpServerStatus/list';
type Pending={resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
export function localAppServerEndpoint(value:string):string {
 const url=new URL(value);
 if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('MCP endpoint must be a credential-free loopback WebSocket');
 return url.href;
}
function cursor(value:unknown):string|undefined {
 if(value===null||value===undefined)return;
 if(typeof value!=='string'||!value||value.length>4096)throw new Error('Invalid MCP pagination cursor');
 return value;
}
export class McpRuntimeClient {
 private socket?:WebSocket;private connecting?:Promise<void>;private ready=false;private closed=false;private nextId=0;private pending=new Map<number,Pending>();
 private readonly endpoint:string;
 constructor(endpoint:string,private readonly token:string){
  this.endpoint=localAppServerEndpoint(endpoint);
  if(!/^[a-zA-Z0-9_-]{43,128}$/.test(token))throw new Error('Invalid local App Server credential');
 }
 get connected():boolean{return !this.closed&&this.ready&&this.socket?.readyState===WebSocket.OPEN;}
 private invalidate(socket:WebSocket,error:Error):void {
  if(this.socket!==socket)return;
  this.socket=undefined;this.ready=false;
  for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();socket.terminate();
 }
 private async connect():Promise<void>{
  if(this.closed)throw new Error('MCP runtime client is closed');
  if(this.ready&&this.socket?.readyState===WebSocket.OPEN)return;
  if(this.connecting)return this.connecting;
  this.connecting=(async()=>{
   const socket=new WebSocket(this.endpoint,{headers:{Authorization:'Bearer '+this.token},followRedirects:false,perMessageDeflate:false,handshakeTimeout:2000,maxPayload:2*1024*1024});this.socket=socket;
   socket.on('error',()=>this.invalidate(socket,new Error('MCP runtime connection failed')));
   socket.on('close',()=>this.invalidate(socket,new Error('MCP runtime disconnected')));
   socket.on('message',(data,binary)=>{
    if(this.socket!==socket)return;
    let message:any;try{if(binary)throw new Error();message=JSON.parse(data.toString());}catch{this.invalidate(socket,new Error('Invalid MCP runtime response'));return;}
    const pending=this.pending.get(message?.id);if(!pending)return;
    this.pending.delete(message.id);clearTimeout(pending.timer);
    if(message.error||!Object.hasOwn(message,'result'))pending.reject(new Error('MCP runtime request failed'));else pending.resolve(message.result);
   });
   try{
    await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',()=>reject(new Error('MCP runtime connection failed')));socket.once('close',()=>reject(new Error('MCP runtime disconnected')));});
    await this.request('initialize',{clientInfo:{name:'mz_codex_hud',version:'1.0.0'},capabilities:{experimentalApi:true}});
    if(this.socket!==socket)throw new Error('MCP runtime disconnected');
    socket.send(JSON.stringify({method:'initialized',params:{}}));this.ready=true;
   }catch(error){this.invalidate(socket,new Error('MCP runtime initialization failed'));throw error;}
  })();
  try{await this.connecting;}finally{this.connecting=undefined;}
 }
 private request(method:Method,params:Record<string,unknown>,deadline=Date.now()+2000):Promise<any>{
  const socket=this.socket;if(!socket||socket.readyState!==WebSocket.OPEN)return Promise.reject(new Error('MCP runtime is not connected'));
  const wait=Math.min(2000,deadline-Date.now());if(wait<=0)return Promise.reject(new Error('MCP runtime request timeout'));
  return new Promise((resolve,reject)=>{
   const id=++this.nextId,timer=setTimeout(()=>this.invalidate(socket,new Error('MCP runtime request timeout')),wait);
   this.pending.set(id,{resolve,reject,timer});
   socket.send(JSON.stringify({id,method,params}),error=>{if(error)this.invalidate(socket,new Error('MCP runtime send failed'));});
  });
 }
 async read(sessionId:string):Promise<McpRuntimeSnapshot>{
  if(!sessionPattern.test(sessionId))throw new Error('Invalid MCP thread identity');
  await this.connect();const deadline=Date.now()+5000;
  let next:string|undefined,loaded=false;const visited=new Set<string>();
  for(let page=0;page<4;page++){
   const result=await this.request('thread/loaded/list',{limit:64,...(next?{cursor:next}:{})},deadline);
   if(!result||!Array.isArray(result.data)||!result.data.every((id:unknown)=>typeof id==='string'))throw new Error('Invalid loaded thread response');
   if(result.data.includes(sessionId)){loaded=true;break;}
   next=cursor(result.nextCursor);if(!next)break;if(visited.has(next))throw new Error('Repeated loaded thread cursor');visited.add(next);
  }
  if(!loaded)throw new Error('Selected thread is not loaded in this App Server');
  next=undefined;visited.clear();const names=new Set<string>(),servers:McpRuntimeSnapshot['servers']=[];
  for(let page=0;page<65;page++){
   const result=await this.request('mcpServerStatus/list',{threadId:sessionId,detail:'toolsAndAuthOnly',limit:64,...(next?{cursor:next}:{})},deadline);
   if(!result||!Array.isArray(result.data))throw new Error('Invalid MCP runtime response');
   for(const server of result.data){
    if(!server||typeof server.name!=='string'||!server.name||server.name.length>256||/[\x00-\x1f\x7f]/.test(server.name)||names.has(server.name))throw new Error('Invalid MCP server identity');
    if(servers.length===64)throw new Error('MCP server limit of 64 exceeded');names.add(server.name);
    servers.push({name:server.name,status:statuses.has(server.runtimeStatus)?server.runtimeStatus as McpConnectionStatus:'unknown'});
   }
   next=cursor(result.nextCursor);if(!next)return {sessionId,checkedAt:Date.now(),complete:true,servers};
   if(visited.has(next))throw new Error('Repeated MCP pagination cursor');visited.add(next);
  }
  throw new Error('MCP pagination limit exceeded');
 }
 close():void{this.closed=true;if(this.socket)this.invalidate(this.socket,new Error('MCP runtime client is closed'));}
}

export class McpRuntimePoller {
 private session='';private epoch=0;private pending=false;private next=0;private value?:McpRuntimeSnapshot;private names:string[]=[];private closed=false;
 constructor(private readonly client:Pick<McpRuntimeClient,'read'|'close'>&{readonly connected?:boolean}){}
 refresh(sessionId:string,now=Date.now()):void {
  if(this.closed)return;
  if(this.session!==sessionId){this.session=sessionId;this.epoch++;this.value=undefined;this.names=[];this.next=0;}
  if(this.client.connected===false)this.value=undefined;
  if(this.pending||now<this.next)return;
  const epoch=this.epoch;this.pending=true;this.next=now+5000;
  void this.client.read(sessionId).then(value=>{if(!this.closed&&epoch===this.epoch){this.value=value.sessionId===sessionId&&value.complete?value:undefined;if(this.value)this.names=this.value.servers.map(server=>server.name);}},()=>{if(epoch===this.epoch)this.value=undefined;}).finally(()=>{this.pending=false;});
 }
 snapshot(sessionId:string,now=Date.now()):McpRuntimeSnapshot|undefined {
  if(this.client.connected===false)this.value=undefined;
  const value=this.value;
  return !this.closed&&value?.sessionId===sessionId&&value.complete&&Number.isFinite(value.checkedAt)&&now>=value.checkedAt&&now-value.checkedAt<=12000?value:undefined;
 }
 knownServers(sessionId:string):string[]{return !this.closed&&sessionId===this.session?this.names.slice():[];}
 close():void{this.closed=true;this.value=undefined;this.names=[];this.client.close();}
}
