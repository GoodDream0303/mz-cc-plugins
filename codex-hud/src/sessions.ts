import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {SessionInfo} from './types.js';
export function codexHome():string{return process.env.CODEX_HOME??path.join(os.homedir(),'.codex');}
async function readMetadata(file:string):Promise<SessionInfo|undefined>{
 // Metadata is at the head; never load conversation text to name a session.
 let handle;try{handle=await fs.open(file,'r');const buffer=Buffer.alloc(4096),chunks:Buffer[]=[];let offset=0;
   while(offset<256*1024){
    const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,256*1024-offset),offset);if(!bytesRead)break;
    const bytes=buffer.subarray(0,bytesRead),end=bytes.indexOf(10);chunks.push(Buffer.from(end<0?bytes:bytes.subarray(0,end)));offset+=bytesRead;if(end>=0)break;
   }
   const meta=JSON.parse(Buffer.concat(chunks).toString('utf8'));const p=meta.payload;
   if(meta.type!=='session_meta'||typeof p?.id!=='string')return;const stat=await handle.stat();
   return {id:p.id,cwd:typeof p.cwd==='string'?p.cwd:'',path:file,startedAt:p.timestamp??meta.timestamp,parentId:p.source?.subagent?.thread_spawn?.parent_thread_id,modified:stat.mtimeMs};
  }catch{/* missing, busy or partial file; retry on the next discovery tick */}finally{await handle?.close();}
}
async function readFiles(files:readonly string[],validate?:(file:string)=>Promise<string|undefined>):Promise<SessionInfo[]>{
 const sessions:Array<SessionInfo|undefined>=new Array(files.length);let next=0;
 async function worker(){for(;;){
  const index=next++;if(index>=files.length)return;
  const file=validate?await validate(files[index]).catch(()=>undefined):files[index];
  if(file)sessions[index]=await readMetadata(file);
 }}
 const workers=await Promise.allSettled(Array.from({length:Math.min(8,files.length)},()=>worker()));
 for(const result of workers)if(result.status==='rejected')throw result.reason;
 // Preserve enumeration order when mtimes tie, regardless of read completion order.
 return sessions.filter((value):value is SessionInfo=>value!==undefined).sort((a,b)=>b.modified-a.modified);
}
export async function listSessions(root=path.join(codexHome(),'sessions')):Promise<SessionInfo[]>{
 const files:string[]=[];
 async function visit(dir:string){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(['ENOENT','EACCES','EPERM'].includes((e as NodeJS.ErrnoException).code??''))return;throw e;}
  for(const entry of entries){if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(entry.name.endsWith('.jsonl'))files.push(file);}
 }
 await visit(root);return readFiles(files);
}
function within(root:string,file:string):boolean{
 const relative=path.relative(root,file);return !!relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);
}
/** A scheduling hint narrows metadata reads; it cannot establish uniqueness. */
export async function readSessionHints(root:string,files:readonly string[]):Promise<SessionInfo[]>{
 const selected=new Set<string>();
 for(const file of files){if(file.endsWith('.jsonl')&&within(root,file))selected.add(path.resolve(file));if(selected.size===256)break;}
 if(!selected.size)return [];
 const canonicalRoot=await fs.realpath(root);
 return readFiles([...selected],async file=>{
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())return;
  const canonical=await fs.realpath(file);return within(canonicalRoot,canonical)?canonical:undefined;
 });
}
export async function findSession(root:string,id:string):Promise<SessionInfo|null>{
 if(!/^[a-zA-Z0-9_-]{3,100}$/.test(id))throw new Error('Invalid session ID');
 const all=await listSessions(root);const exact=all.filter(s=>s.id===id);
 if(exact.length)return exact[0];const matches=all.filter(s=>s.id.startsWith(id));if(matches.length>1)throw new Error('Ambiguous session ID; use the full ID');return matches[0]??null;
}
