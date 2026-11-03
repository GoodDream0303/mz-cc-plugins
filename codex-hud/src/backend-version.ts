import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const upstreamBackendCommit='20aa1d7254ee93f64dafa059ef89341d9767470a';
export interface CompactBackendPin {format:1;version:'3.4.0-hud-compact-v1';upstreamCommit:string;sha256:string}
const backendDirectory=fileURLToPath(new URL('../backend/',import.meta.url));
function packagedPin(directory=backendDirectory):CompactBackendPin|undefined {
 try{return JSON.parse(fs.readFileSync(path.join(directory,'psmux-compact.json'),'utf8'));}catch{return;}
}
export function verifyBackend(binary:string,output:string,pin?:CompactBackendPin):{kind:'upstream'|'compact'}|undefined {
 // psmux preserves a tmux-compatible first line before its own build identity.
 const versions=output.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('psmux '));if(versions.length!==1)return;
 const version=versions[0];
 if(/^psmux 3\.4\.0 \(20aa1d7\b/.test(version))return {kind:'upstream'};
 if(!/^psmux 3\.4\.0-hud-compact-v1 \(20aa1d7\b/.test(version))return;
 const expected=pin??packagedPin();
 if(expected?.format!==1||expected.version!=='3.4.0-hud-compact-v1'||expected.upstreamCommit!==upstreamBackendCommit||!/^[a-f0-9]{64}$/.test(expected.sha256))return;
 try{
  if(createHash('sha256').update(fs.readFileSync(binary)).digest('hex')!==expected.sha256)return;
  return {kind:'compact'};
 }catch{/* Unverified replacements and missing binaries are rejected. */}
}
export function packagedBackendPath(directory=backendDirectory):string {
 const pin=packagedPin(directory),binary=path.join(directory,'psmux.exe');
 return pin&&verifyBackend(binary,'psmux '+pin.version+' (20aa1d7)',pin)?.kind==='compact'?binary:'';
}
