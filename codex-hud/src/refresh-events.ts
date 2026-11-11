import fs from 'node:fs';
import path from 'node:path';

interface WatchHandle {close():void;on(event:string,listener:(error?:Error)=>void):unknown}
type WatchFactory=(directory:string,options:{recursive:boolean},listener:(event:string,filename:string|Buffer|null)=>void)=>WatchHandle;
interface Subscription {file?:string;reason:string}
interface Directory {path:string;recursive:boolean;targets:Set<Subscription>;handle?:WatchHandle}

/** Owns only wakeups and filesystem hints. Readers still validate their inputs. */
export class RefreshEvents {
 private pending=new Map<string,number>();private directories=new Map<string,Directory>();
 private wake?:()=>void;private closed=false;
 constructor(private readonly factory:WatchFactory=(dir,options,listener)=>fs.watch(dir,options,listener),private readonly requested?:(reason:string)=>void){}
 request(reason:string,delayMs=0):void {
  if(this.closed)return;
  const at=Date.now()+delayMs;this.pending.set(reason,Math.min(this.pending.get(reason)??Infinity,at));this.requested?.(reason);this.wake?.();
 }
 async wait(deadline:number):Promise<Set<string>> {
  for(;;){
   const now=Date.now(),ready=new Set<string>();
   for(const [reason,at]of this.pending)if(at<=now){ready.add(reason);this.pending.delete(reason);}
   if(this.closed||ready.size||now>=deadline)return ready;
   const at=Math.min(deadline,...this.pending.values());
   await new Promise<void>(resolve=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const done=()=>{if(timer)clearTimeout(timer);this.wake=undefined;resolve();};
    this.wake=done;if(Number.isFinite(at))timer=setTimeout(done,Math.max(1,at-Date.now()));
   });
  }
 }
 watch(file:string,reason:string,recursive=false):()=>void {
  if(this.closed)return ()=>{};
  const directory=recursive?path.resolve(file):path.dirname(path.resolve(file)),key=directory+'\0'+recursive;
  let entry=this.directories.get(key);
  if(!entry){entry={path:directory,recursive,targets:new Set()};this.directories.set(key,entry);}
  const target:Subscription={file:recursive?undefined:path.basename(file),reason};entry.targets.add(target);this.attach(entry);
  return ()=>{entry!.targets.delete(target);if(!entry!.targets.size){entry!.handle?.close();this.directories.delete(key);}};
 }
 private attach(entry:Directory):void {
  if(entry.handle||this.closed)return;
  const invalidate=()=>{for(const target of entry.targets)this.request(target.reason);};
  try{
   const handle=this.factory(entry.path,{recursive:entry.recursive},(_event,name)=>{
    for(const target of entry.targets)if(name===null||target.file===undefined||String(name).toLowerCase()===target.file.toLowerCase())this.request(target.reason,25);
   });entry.handle=handle;
   const lost=()=>{if(entry.handle!==handle)return;entry.handle=undefined;handle.close();invalidate();};
   handle.on('error',lost);handle.on('close',lost);
  }catch{invalidate();}
 }
 reconcile():void {for(const entry of this.directories.values())this.attach(entry);}
 close():void {
  if(this.closed)return;this.closed=true;
  for(const entry of this.directories.values()){const handle=entry.handle;entry.handle=undefined;handle?.close();}
  this.directories.clear();this.pending.clear();this.wake?.();
 }
}
