import {sanitize} from '../../dist/terminal-text.js';

/** Retain visible rows across the viewer's differential writes for recovery assertions. */
export function frameScreen(){
 const rows=[];
 return output=>{
  for(const match of output.matchAll(/\x1b\[(\d+);1H\x1b\[0m([\s\S]*?)(?=\x1b\[\d+;1H|$)/g))rows[Number(match[1])-1]=sanitize(match[2]);
  return rows.join('\n');
 };
}
