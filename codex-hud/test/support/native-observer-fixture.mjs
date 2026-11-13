/** Simulate only the Windows observer boundary; client, files and viewer stay real. */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {createInterface} from 'node:readline';
const self=fileURLToPath(import.meta.url);

export function copyObserverRuntime(dist,destination){
 const source=path.join(path.dirname(dist),'backend'),target=path.join(path.dirname(destination),'backend');fs.mkdirSync(target,{recursive:true});
 for(const file of ['process-events.exe','process-events.json'])fs.copyFileSync(path.join(source,file),path.join(target,file));
}

export function installNativeObserverFixture({facts,readyDelay=0,queryDelay=0,firstFailure=false,onSpawn=()=>{}}){
 const original=cp.spawn;let launches=0;
 cp.spawn=(binary,args,options)=>{
  if(path.basename(String(binary)).toLowerCase()!=='process-events.exe')return original(binary,args,options);
  const fixture={facts,readyDelay,queryDelay,fail:firstFailure&&launches++===0};
  const started=performance.now(),child=original(process.execPath,[self,'--worker',Buffer.from(JSON.stringify(fixture)).toString('base64')],options);
  onSpawn({elapsedMs:performance.now()-started});return child;
 };
 syncBuiltinESMExports();
 return ()=>{cp.spawn=original;syncBuiltinESMExports();};
}

if(process.argv[2]==='--worker'){
 const fixture=JSON.parse(Buffer.from(process.argv[3],'base64').toString('utf8')),timers=new Set();
 const later=(operation,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);operation();},ms);timers.add(timer);};
 const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
 later(()=>{if(fixture.fail)process.stdout.write('{"type":"error","code":"IDENTITY","id":0}\n',()=>process.exit(2));else send({type:'ready'});},fixture.readyDelay);
 const lines=createInterface({input:process.stdin});
 lines.on('line',line=>{
  const [type,id,...ids]=line.trim().split(/\s+/);
  if(type==='Q'){lines.close();return;}
  if(type==='F')later(()=>send({type:'facts',id:Number(id),values:fixture.facts.filter(p=>ids.includes(String(p.pid)))}),fixture.queryDelay);
 });
 lines.on('close',()=>{for(const timer of timers)clearTimeout(timer);process.exit(0);});
}
