import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
export interface ProfileOptions {entry:string;cli:string;node:string}
export interface ProfileChange {file:string;before:string;after:string;encoding:'utf8'|'utf16le';block:string;removedBlock?:string}
const begin='# >>> mz-codex-hud >>>',end='# <<< mz-codex-hud <<<';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function content(file:string):{text:string;encoding:'utf8'|'utf16le'} {
 if(!fs.existsSync(file))return {text:'',encoding:'utf8'};
 if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>1024*1024)throw new Error('Unsupported PowerShell profile file');
 const bytes=fs.readFileSync(file);if(bytes[0]===0xff&&bytes[1]===0xfe)return {text:bytes.toString('utf16le'),encoding:'utf16le'};
 new TextDecoder('utf-8',{fatal:true}).decode(bytes);return {text:bytes.toString('utf8'),encoding:'utf8'};
}
function expression(value:string):string {if(!path.isAbsolute(value))throw new Error('Profile loader paths must be absolute');return "([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(value).toString('base64')+"')))";}
export function profileChange(file:string,options:ProfileOptions,mode:'install'|'remove'='install'):ProfileChange {
 if(!path.isAbsolute(file))throw new Error('Select an absolute PowerShell profile path');
 const original=content(file),before=original.text,eol=before.includes('\r\n')?'\r\n':'\n';let prefix=before,suffix='',separator=before.length>0&&!before.endsWith('\n');
 const start=before.indexOf(begin);let removedBlock:string|undefined;
 if(start>=0){
  const finish=before.indexOf(end,start),raw=finish<0?'':before.slice(start,finish+end.length),lines=raw.split(/\r?\n/);
  if(start>0&&before[start-1]!=='\n'||finish>=0&&finish+end.length<before.length&&!before.slice(finish+end.length).startsWith('\n')&&!before.slice(finish+end.length).startsWith('\r\n')||finish>=0&&before.indexOf(end,finish+end.length)>=0)throw new Error('Managed profile markers must be unique standalone whole lines');
  if(finish<0||lines.length!==5||lines[0]!==begin||lines[4]!==end||lines[1]!==('# block-sha256: '+hash(lines[3]))||!/^# separator-added: [01]$/.test(lines[2])||before.indexOf(begin,start+1)>=0)throw new Error('Managed HUD profile block was modified; review it before changing');
  removedBlock=raw;
  separator=lines[2].endsWith('1');prefix=before.slice(0,start);suffix=before.slice(finish+end.length);if(suffix.startsWith('\r\n'))suffix=suffix.slice(2);else if(suffix.startsWith('\n'))suffix=suffix.slice(1);
  if(separator){if(prefix.endsWith('\r\n'))prefix=prefix.slice(0,-2);else if(prefix.endsWith('\n'))prefix=prefix.slice(0,-1);else throw new Error('Managed profile separator was edited');}
 }else if(before.includes(end))throw new Error('Managed HUD profile block is incomplete');
 const loader='. '+expression(options.entry)+' -HudCli '+expression(options.cli)+' -NodePath '+expression(options.node);
 const block=[begin,'# block-sha256: '+hash(loader),'# separator-added: '+(separator?'1':'0'),loader,end].join(eol)+eol;
 return {file:path.resolve(file),before,after:mode==='remove'?(start<0?before:prefix+(separator&&suffix?eol:'')+suffix):prefix+(separator?eol:'')+block+suffix,encoding:original.encoding,block,removedBlock};
}
export function applyProfileChange(change:ProfileChange):void {
 const current=content(change.file);if(current.text!==change.before||current.encoding!==change.encoding)throw new Error('PowerShell profile changed after review; regenerate the proposed change');
 if(change.before===change.after)return;
 fs.mkdirSync(path.dirname(change.file),{recursive:true});if(fs.existsSync(change.file)&&!fs.existsSync(change.file+'.mz-hud.bak'))fs.copyFileSync(change.file,change.file+'.mz-hud.bak',fs.constants.COPYFILE_EXCL);
 const temp=change.file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,change.after,{encoding:change.encoding,flag:'wx',mode:0o600});fs.renameSync(temp,change.file);}finally{try{fs.unlinkSync(temp);}catch{}}
}
