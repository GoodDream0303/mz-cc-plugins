import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
import {HudInput} from '../dist/input.js';import {HudSelection} from '../dist/selection.js';
function fixture(t){
 const selection=new HudSelection(),copies=[],keys=[];selection.frame(['alpha beta'],20,3);
 const input=new HudInput(data=>selection.feed(data),(_,key)=>{keys.push(key.name);if(key.name==='escape')selection.clear();if(key.name==='c'&&key.ctrl)copies.push(selection.text());});t.after(()=>input.close());
 return {input,selection,copies,keys};
}
const drag='\x1b[<0;1;1M\x1b[<32;3;1M',release='\x1b[<0;5;1m';
test('mixed input preserves copy before and after release within one chunk',t=>{
 const f=fixture(t);f.input.feed(drag+'\x03'+release+'\x03');assert.deepEqual(f.copies,['alp','alpha']);assert.deepEqual(f.keys,['c','c']);
});
test('ordered mouse decoding survives every split without leaking protocol bytes as keys',t=>{
 const data=drag+release+'\x03';for(let i=1;i<data.length;i++){const f=fixture(t);f.input.feed(data.slice(0,i));f.input.feed(data.slice(i));assert.deepEqual(f.copies,['alpha'],'split '+i);assert.deepEqual(f.keys,['c']);}
});
test('an Escape followed immediately by a mouse report cancels then starts a new selection',t=>{
 const f=fixture(t);f.input.feed(drag+release);f.input.feed('\x1b'+drag+release+'\x03');assert.deepEqual(f.copies,['alpha']);assert.deepEqual(f.keys,['escape','c']);
});
test('bracket mouse prefixes survive a delayed continuation and bare Escape still cancels',async t=>{
 const f=fixture(t);f.input.feed('\x1b[');await delay(600);f.input.feed('<0;1;1M'+release+'\x03');assert.deepEqual(f.copies,['alpha']);
 f.input.feed('\x1b');await delay(600);assert.equal(f.selection.active,false);f.input.feed('\x1b[C\x1b[D');assert.deepEqual(f.keys,['c','escape','right','left']);
});
