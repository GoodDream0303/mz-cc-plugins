import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';

/** Standalone synthetic viewer: no real Codex, backend, Git or model request. */
export function viewerProbe({duration=1050,refreshMs=250,appendAt=120,dist=path.resolve(import.meta.dirname,'../../dist')}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-refresh-probe-'));
 try{
  const copy=path.join(root,'dist');fs.cpSync(dist,copy,{recursive:true});
  for(const [name,exports]of [['render',['render']],['config',['loadConfig']],['reader',['SessionReader']]]){
   fs.renameSync(path.join(copy,name+'.js'),path.join(copy,name+'-body.js'));
   const text=name==='reader'?`export * from './reader-body.js';import {SessionReader as Original} from './reader-body.js';export class SessionReader extends Original{async read(){globalThis.counts.read++;return super.read();}}`:
    `export * from './${name}-body.js';import {${exports[0]} as original} from './${name}-body.js';export function ${exports[0]}(...args){globalThis.counts.${name}++;return original(...args);}`;
   fs.writeFileSync(path.join(copy,name+'.js'),text);
  }
  const script=path.join(root,'probe.mjs');
  fs.writeFileSync(script,`import fs from 'node:fs';import path from 'node:path';
globalThis.counts={read:0,config:0,render:0,paint:0};
const root=${JSON.stringify(root)},start=performance.now(),cpu=process.cpuUsage();
const {main}=await import(${JSON.stringify(pathToFileURL(path.join(copy,'cli.js')).href)});
const {defaultConfig,set,saveConfig}=await import(${JSON.stringify(pathToFileURL(path.join(copy,'config.js')).href)});
const cfg=path.join(root,'config.json');let config=set(set(set(defaultConfig(),'terminal.refreshMs',${refreshMs}),'gitStatus.enabled',false),'display.showDuration',false);config=set(config,'display.showModel',true);saveConfig(cfg,config);
const file=path.join(root,'session.jsonl'),log=(type,payload)=>JSON.stringify({type,payload})+'\\n';fs.writeFileSync(file,log('session_meta',{id:'refresh-probe',cwd:root}));
const {createLaunch,updateLaunch}=await import(${JSON.stringify(pathToFileURL(path.join(copy,'runtime.js')).href)});
const launch=createLaunch(root,config,path.join(root,'runtime'),cfg);updateLaunch(launch.file,d=>{d.sessionId='refresh-probe';d.transcriptPath=file;});
Object.defineProperties(process.stdout,{isTTY:{value:true},columns:{value:120},rows:{value:12}});
let appendTime,visibleLatency,scheduled=false;process.stdout.write=value=>{if(String(value).includes('\\x1b[H\\x1b[2J')){counts.paint++;if(String(value).includes('PROBE-MODEL')&&visibleLatency===undefined)visibleLatency=performance.now()-appendTime;if(!scheduled){scheduled=true;setTimeout(()=>{appendTime=performance.now();fs.appendFileSync(file,log('turn_context',{model:'PROBE-MODEL'}));},${appendAt});setTimeout(()=>updateLaunch(launch.file,d=>d.hudStop=true),${duration});}}return true;};
await main(['watch','--launch',launch.file,'--no-color']);fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({counts,visibleLatency,wallMs:performance.now()-start,cpu:process.cpuUsage(cpu)}));`);
  const env={...process.env};delete env.MZ_HUD_ORIGIN;delete env.MZ_HUD_CONFIG_FILE;
  const child=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000,env});
  if(child.status!==0)throw Error('Synthetic viewer failed: '+child.stderr);
  return JSON.parse(fs.readFileSync(path.join(root,'result.json'),'utf8'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
