import {execFile} from 'node:child_process';

/** Bounded native query which does not block key, file or cancellation events. */
export function runText(file:string,args:string[],options:{timeout:number;maxBuffer:number;env?:NodeJS.ProcessEnv;signal?:AbortSignal}):Promise<string> {
 return new Promise((resolve,reject)=>{
  execFile(file,args,{...options,encoding:'utf8',windowsHide:true},(error,stdout)=>error?reject(error):resolve(stdout));
 });
}
