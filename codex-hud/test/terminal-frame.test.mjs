import test from 'node:test';import assert from 'node:assert/strict';
import {frameUpdate,sanitize} from '../dist/terminal-text.js';

// Apply cursor/erase commands to rows so stale suffixes and removed rows are observable.
function apply(previous,output,height=previous.length){
 const screen=Array.from({length:height},(_,i)=>Array.from(previous[i]??''));let row=0,column=0;
 for(const token of output.matchAll(/\x1b\[([0-9;]*)([A-Za-z])|([^\x1b]+)/g)){
  if(token[2]==='H'){const [y,x]=token[1].split(';').map(Number);row=y-1;column=x-1;assert.ok(row<height);}
  else if(token[2]==='K')screen[row].length=column;
  else if(token[2])assert.equal(token[2],'m','only positioning, color and line erasure are needed');
  else for(const char of token[3])screen[row][column++]=char;
 }
 return screen.map(line=>line.join(''));
}

test('shorter text replaces its row without disturbing the unchanged row',()=>{
 const previous=['stable context','long-running command'];const output=frameUpdate(previous,['stable context','done'],2);
 assert.doesNotMatch(output,/stable context|\x1b\[1;1H/);assert.deepEqual(apply(previous,output),['stable context','done']);
});
test('removed and empty rows erase their old text without clearing the pane',()=>{
 const previous=['header','expired tool','old pager'];
 assert.deepEqual(apply(previous,frameUpdate(previous,['header'],3)),['header','','']);
 assert.deepEqual(apply(previous,frameUpdate(previous,[],3)),['','','']);
});
test('unchanged frames produce no terminal writes',()=>{
 assert.equal(frameUpdate(['same'],['same'],2),'');assert.equal(frameUpdate([],[],2),'');
});
test('geometry changes repaint identical visible rows and never address clipped rows',()=>{
 const output=frameUpdate(['same','clipped'],['same','clipped'],1,true);
 assert.match(output,/same/);assert.doesNotMatch(output,/clipped|\x1b\[2;1H/);assert.deepEqual(apply(['stale'],output,1),['same']);
});
test('colored Unicode rows retain complete text and reset style before erasing the suffix',()=>{
 const line='\x1b[38;2;10;20;30m上下文 😀\x1b[0m',output=frameUpdate(['old'],[line],1);
 assert.ok(output.includes(line));assert.match(output,/\x1b\[0m\x1b\[K$/);assert.equal(sanitize(output),'上下文 😀');
});
test('full-width rows keep their final ASCII or wide glyph instead of erasing the wrap-pending cell',()=>{
 for(const line of ['abcd','中文']){
  const output=frameUpdate(['old'],[line],1,false,4);assert.ok(output.includes(line));assert.doesNotMatch(output,/\x1b\[K/);
 }
});
