import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {get,type Config} from './config.js';
import {render} from './render.js';
import {SessionReader} from './reader.js';
import {readEnvironment} from './environment.js';
import type {HudSnapshot} from './types.js';

export interface TerminalViewport {columns:number;rows:number}
export interface InitialPaneSize {mode:'content'|'ratio';fraction:number;contentRows?:number;columns?:number;parentRows?:number}
function validViewport(view:TerminalViewport|undefined):view is TerminalViewport {
 return !!view&&Number.isInteger(view.columns)&&Number.isInteger(view.rows)&&view.columns>=10&&view.columns<=2000&&view.rows>=10&&view.rows<=1000;
}
export function measureTerminalViewport():TerminalViewport|undefined {
 if(!process.env.WT_SESSION)return;
 if(process.stdout.isTTY&&validViewport({columns:process.stdout.columns,rows:process.stdout.rows}))return {columns:process.stdout.columns,rows:process.stdout.rows};
 if(process.platform!=='win32')return;
 try{
  const helper=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bin/terminal-viewport.ps1');
  const view=JSON.parse(execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',helper],{encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:4096,stdio:['ignore','pipe','ignore']}).replace(/^\uFEFF/,''));
  if(validViewport(view))return view;
 }catch{/* Unknown viewport keeps the configured split; never infer another window. */}
}
export function planInitialPaneSize(config:Config,snapshot:HudSnapshot,viewport?:TerminalViewport):InitialPaneSize {
 const fallback:InitialPaneSize={mode:'ratio',fraction:get(config,'terminal.paneSize')};
 if(!get(config,'terminal.autoHeight')||!validViewport(viewport))return fallback;
 const contentRows=render(snapshot,config,{width:viewport.columns,height:10000,color:false}).totalLines;
 const cap=Math.min(fallback.fraction,(viewport.rows-Math.min(10,Math.floor(viewport.rows/2))-1)/(viewport.rows+1));
 // Account for the new pane's padding, splitter and character-cell rounding.
 const fraction=Math.min(cap,(contentRows+2)/(viewport.rows+1));
 return {mode:'content',fraction,contentRows,columns:viewport.columns,parentRows:viewport.rows};
}
export async function initialPaneSize(config:Config,options:{sessionId?:string;transcriptPath?:string;home:string;window:string;measure?:()=>TerminalViewport|undefined}):Promise<InitialPaneSize> {
 const fallback:InitialPaneSize={mode:'ratio',fraction:get(config,'terminal.paneSize')};
 if(!get(config,'terminal.autoHeight')||options.window!=='last'||!options.sessionId||!options.transcriptPath)return fallback;
 const viewport=(options.measure??measureTerminalViewport)();if(!validViewport(viewport))return fallback;
 try{
  const snapshot=await new SessionReader(options.transcriptPath,options.sessionId).read();
  if(snapshot.cwd)snapshot.environment=readEnvironment(snapshot.cwd,options.home);
  return planInitialPaneSize(config,snapshot,viewport);
 }catch{return fallback;}
}
