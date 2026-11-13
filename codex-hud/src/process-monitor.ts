import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {processBirthMicros} from './process-birth.js';
import type {HostProof,ProcessFact} from './psmux.js';

export type ProcessMonitorStatus='starting'|'verified'|'unknown'|'source-exited'|'closed';
interface Request {ids:Set<number>;resolve:(value:ProcessFact[])=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;release:()=>void}
const directory=fileURLToPath(new URL('../backend/',import.meta.url));
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const aborted=()=>Object.assign(new Error('Native process query cancelled'),{name:'AbortError',code:'ABORT_ERR'});

export function processHelperPath(root=directory):string {
 try{
  const manifest=path.join(root,'process-events.json'),binary=path.join(root,'process-events.exe');
  if(fs.statSync(manifest).size>8192||fs.lstatSync(binary).isSymbolicLink()||!fs.statSync(binary).isFile())throw Error();
  const pin=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(pin.format!==1||pin.protocol!==1||pin.platform!=='win32-x64'||! /^[a-f0-9]{64}$/.test(pin.sha256)||createHash('sha256').update(fs.readFileSync(binary)).digest('hex')!==pin.sha256)throw Error();
  return binary;
 }catch{throw new Error('A checksum-verified native process helper is required');}
}

/** A private child observes already-proven incarnations; it cannot prove pane ownership. */
export class ProcessMonitor {
 private state:ProcessMonitorStatus='unknown';
 private retryAt=0;private generation=0;private sequence=0;
 private child?:ChildProcessWithoutNullStreams;
 private startup?:ReturnType<typeof setTimeout>;
 private requests=new Map<number,Request>();
 private expected=new Map<number,ProcessFact>();
 constructor(proof:HostProof,viewer:ProcessFact,private readonly wake:()=>void){
  if(viewer.pid!==process.pid)throw new Error('Only this viewer may own its native process observer');
  for(const fact of [viewer,proof.owner,proof.server,...(proof.frontend?[proof.frontend]:[])]){
   const old=this.expected.get(fact.pid);
   if(!positive(fact.pid)||!Number.isSafeInteger(fact.parentPid)||fact.parentPid<0||typeof fact.name!=='string'||processBirthMicros(fact.startedAt)===undefined||old&&JSON.stringify(old)!==JSON.stringify(fact))throw new Error('Invalid native process identity scope');
   this.expected.set(fact.pid,fact);
  }
  if(this.expected.size>8)throw new Error('Native process identity scope is too large');
 }
 get status():ProcessMonitorStatus{return this.state;}
 get nextRetryAt():number{return this.retryAt;}
 private change(state:ProcessMonitorStatus):void {if(this.state!==state){this.state=state;this.wake();}}
 private finish(id:number,error?:Error,values?:ProcessFact[]):void {
  const request=this.requests.get(id);if(!request)return;this.requests.delete(id);clearTimeout(request.timer);request.release();
  if(error)request.reject(error);else request.resolve(values!);
 }
 private retire(error:Error):void {
  this.generation++;if(this.startup)clearTimeout(this.startup);this.startup=undefined;
  for(const id of this.requests.keys())this.finish(id,error);
  const child=this.child;this.child=undefined;
  if(child){child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.kill();}
 }
 private fail(generation:number):void {
  if(generation!==this.generation||this.state==='closed'||this.state==='source-exited')return;
  this.retire(new Error('Native process observer unavailable'));
  this.retryAt=Date.now()+5000;this.change('unknown');
 }
 reconcile(now=Date.now()):void {
  if(this.state!=='unknown'||now<this.retryAt)return;
  this.retryAt=Infinity;this.change('starting');const generation=++this.generation;
  try{
   if(process.platform!=='win32')throw Error();
   const binary=processHelperPath(),scope=[...this.expected.values()].map(f=>f.pid+':'+processBirthMicros(f.startedAt));
   const child=spawn(binary,['--parent',String(process.pid),'--scope',...scope],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
   this.startup=setTimeout(()=>this.fail(generation),6000);
   let buffered='',stderrBytes=0;
   child.stdout.setEncoding('utf8');child.stdout.on('data',(chunk:string)=>{
    if(generation!==this.generation)return;
    buffered+=chunk;if(Buffer.byteLength(buffered)>65536){this.fail(generation);return;}
    for(;;){const end=buffered.indexOf('\n');if(end<0)break;const line=buffered.slice(0,end);buffered=buffered.slice(end+1);
     try{this.message(JSON.parse(line),generation);}catch{this.fail(generation);}
     if(generation!==this.generation)return;
    }
   });
   // Consume, bound and discard native stderr; never surface/persist its contents.
   child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>65536)this.fail(generation);});
   child.once('error',()=>this.fail(generation));child.once('exit',()=>this.fail(generation));
   child.stdout.once('end',()=>this.fail(generation));child.stdin.on('error',()=>this.fail(generation));
  }catch{this.fail(generation);}
 }
 private message(message:any,generation:number):void {
  if(!message||typeof message!=='object')throw Error();
  if(message.type==='ready'){
   if(this.state!=='starting')throw Error();
   if(this.startup)clearTimeout(this.startup);this.startup=undefined;this.change('verified');return;
  }
  if(message.type==='exited'){
   if(!positive(message.pid)||!this.expected.has(message.pid))throw Error();
   this.retire(new Error('Observed source process exited'));this.retryAt=Infinity;this.change('source-exited');return;
  }
  if(message.type==='error'){
   if(typeof message.code!=='string'||! /^[A-Z0-9_]{1,32}$/.test(message.code))throw Error();
   if(positive(message.id)&&this.requests.has(message.id)){this.finish(message.id,new Error('Native process query unavailable'));return;}
   this.fail(generation);return;
  }
  if(message.type!=='facts'||!positive(message.id)||message.id>this.sequence||!Array.isArray(message.values)||message.values.length>8)throw Error();
  const request=this.requests.get(message.id);if(!request)return; // A cancelled request may finish at the native boundary.
  const seen=new Set<number>();
  for(const fact of message.values){
   if(!fact||!positive(fact.pid)||!request.ids.has(fact.pid)||seen.has(fact.pid)||!Number.isSafeInteger(fact.parentPid)||fact.parentPid<0||typeof fact.name!=='string'||!fact.name||fact.name.length>=260||/[\x00-\x1f]/.test(fact.name)||typeof fact.startedAt!=='string'||processBirthMicros(fact.startedAt)===undefined)throw Error();
   seen.add(fact.pid);
  }
  this.finish(message.id,undefined,message.values);
 }
 facts(pids:number[],signal?:AbortSignal):Promise<ProcessFact[]> {
  if(signal?.aborted)return Promise.reject(aborted());
  if(this.state!=='verified'||!this.child)return Promise.reject(new Error('Native process observer is not verified'));
  if(!pids.length||pids.length>8||pids.some(pid=>!positive(pid)||!this.expected.has(pid))||new Set(pids).size!==pids.length)return Promise.reject(new Error('Requested processes are outside this observer scope'));
  if(this.requests.size>=32||this.sequence>=2147483647)return Promise.reject(new Error('Native process observer request limit reached'));
  const id=++this.sequence,generation=this.generation;
  return new Promise((resolve,reject)=>{
   const cancel=()=>this.finish(id,aborted());
   const timer=setTimeout(()=>{this.finish(id,new Error('Native process query timed out'));this.fail(generation);},6000);
   this.requests.set(id,{ids:new Set(pids),resolve,reject,timer,release:()=>signal?.removeEventListener('abort',cancel)});
   signal?.addEventListener('abort',cancel,{once:true});
   this.child!.stdin.write('F '+id+' '+pids.join(' ')+'\n',error=>{if(error)this.fail(generation);});
  });
 }
 close():void {
  if(this.state==='closed')return;
  this.retryAt=Infinity;this.retire(new Error('Native process observer closed'));this.change('closed');
 }
}
