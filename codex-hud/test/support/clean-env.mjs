import fs from 'node:fs';import path from 'node:path';
export function copyPackagedRuntime(source,target){
 const base=path.toNamespacedPath(path.resolve(source));
 fs.cpSync(source,target,{recursive:true,filter:file=>!['node_modules','src','test','scripts'].includes(path.relative(base,path.toNamespacedPath(file)).split(path.sep)[0])});
}
export function cleanEnvironment(root,overrides={}){
 const env={};for(const key of ['SystemRoot','SYSTEMROOT','SystemDrive','WINDIR','ComSpec','COMSPEC','PATHEXT','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'])if(process.env[key]!==undefined)env[key]=process.env[key];
 const win=process.env.SystemRoot??'C:/Windows';
 for(const dir of ['home','local','roaming','temp'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 return {...env,USERPROFILE:path.join(root,'home'),HOME:path.join(root,'home'),CODEX_HOME:path.join(root,'home/.codex'),LOCALAPPDATA:path.join(root,'local'),APPDATA:path.join(root,'roaming'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),PATH:[path.join(win,'System32'),path.join(win,'System32/WindowsPowerShell/v1.0')].join(path.delimiter),NODE_PATH:'',...overrides};
}
