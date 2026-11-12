import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SessionReader} from '../dist/reader.js';
const record=(type,payload)=>JSON.stringify({type,payload,timestamp:'2026-11-12T06:20:00Z'})+'\n';
const image=(size=800000)=>({type:'input_image',image_url:'data:image/png;base64,'+'A'.repeat(size),detail:'original'});
const call=(id='images')=>record('response_item',{type:'custom_tool_call',call_id:id,name:'exec',input:'await tools.view_image({path:"PRIVATE"});'});
const result=(output,id='images',extra={})=>record('response_item',{type:'custom_tool_call_output',call_id:id,output,...extra});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hud-reader-images-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'rollout-abc.jsonl');fs.writeFileSync(file,record('session_meta',{id:'abc'})+call());return {file,reader:new SessionReader(file,'abc')};}

test('large four-image results complete the tool without a warning or retained image data',async t=>{
 const {file,reader}=fixture(t);fs.appendFileSync(file,result([{type:'input_text',text:'Script completed'},image(),image(),image(),image()])+record('event_msg',{type:'token_count',info:{last_token_usage:{total_tokens:50},model_context_window:200}}));
 const snapshot=await reader.read();assert.equal(snapshot.tools[0].status,'done');assert.deepEqual(snapshot.errors,[]);assert.deepEqual(snapshot.context,{used:50,window:200});assert.ok(JSON.stringify(snapshot).length<2000);assert.ok(!JSON.stringify(snapshot).includes('data:image'));
 assert.deepEqual((await reader.read()).errors,[]);
});

test('an unfinished large image keeps its call running until the appended failure result closes',async t=>{
 const {file,reader}=fixture(t),line=result([{type:'input_text',text:'Script failed'},image(3*1024*1024)]),split=line.indexOf('AAAA')+2200000;
 fs.appendFileSync(file,line.slice(0,split));const partial=await reader.read();assert.equal(partial.tools[0].status,'running');assert.deepEqual(partial.errors,[]);
 fs.appendFileSync(file,line.slice(split)+record('turn_context',{model:'after-image'}));const complete=await reader.read();assert.equal(complete.tools[0].status,'failed');assert.equal(complete.model,'after-image');assert.deepEqual(complete.errors,[]);
});

test('large images preserve pending executor IDs and the later poll finishes the original tool',async t=>{
 const {file,reader}=fixture(t);fs.appendFileSync(file,result([{type:'input_text',text:'Script running with cell ID 42'},image(3*1024*1024)]));
 const pending=await reader.read();assert.equal(pending.tools[0].status,'running');assert.deepEqual(pending.errors,[]);
 fs.appendFileSync(file,record('response_item',{type:'function_call',call_id:'poll',name:'wait',arguments:'{"cell_id":"42"}'})+record('response_item',{type:'function_call_output',call_id:'poll',output:'Script completed'}));
 assert.equal((await reader.read()).tools.find(x=>x.id==='images').status,'done');
});

test('large image results retain session identity checks before accepting completion',async t=>{
 const {file,reader}=fixture(t);fs.appendFileSync(file,result([image(3*1024*1024)],'images',{session_id:'other'}));
 const snapshot=await reader.read();assert.equal(snapshot.tools[0].status,'running');assert.deepEqual(snapshot.errors,[]);
});

test('oversized text is still rejected and the next record is read',async t=>{
 const {file,reader}=fixture(t);fs.appendFileSync(file,result('PRIVATE'+'x'.repeat(3*1024*1024))+record('turn_context',{model:'after-text'}));
 const snapshot=await reader.read();assert.equal(snapshot.tools[0].status,'running');assert.deepEqual(snapshot.errors,['oversized record ignored']);assert.equal(snapshot.model,'after-text');assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
});

test('discarding oversized text followed by large images cannot swallow the next valid record',async t=>{
 const {file,reader}=fixture(t),head=fs.readFileSync(file,'utf8'),prefix='{"type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"images","output":[{"type":"input_text","text":"',textEnd='"},';
 // End the rejected text exactly at a physical read boundary, before the image.
 const textSize=33*65536-Buffer.byteLength(head+prefix+textEnd);
 fs.appendFileSync(file,prefix+'B'.repeat(textSize)+textEnd+JSON.stringify(image(3*1024*1024))+']}}\n'+record('turn_context',{model:'after-rejected-images'}));
 const snapshot=await reader.read();assert.equal(snapshot.model,'after-rejected-images');assert.equal(snapshot.tools[0].status,'running');assert.deepEqual(snapshot.errors,['oversized record ignored']);
});

test('malformed escapes in omitted image bodies cannot fabricate tool completion',async t=>{
 for(const invalid of ['\\q','\\u12XZ','\u0001']){
  const {file,reader}=fixture(t),line=result([{type:'input_text',text:'Script completed'},image(3*1024*1024)]).replace('AAAA',invalid);
  fs.appendFileSync(file,line+record('turn_context',{model:'after-invalid'}));const snapshot=await reader.read();assert.equal(snapshot.tools[0].status,'running');assert.equal(snapshot.model,'after-invalid');
 }
});

test('replacing an unfinished large image resets projection and lifecycle state',async t=>{
 const {file,reader}=fixture(t),line=result([image(3*1024*1024)]);fs.appendFileSync(file,line.slice(0,-100));await reader.read();
 fs.writeFileSync(file,record('session_meta',{id:'abc'})+record('turn_context',{model:'replacement'}));const snapshot=await reader.read();assert.equal(snapshot.model,'replacement');assert.deepEqual(snapshot.tools,[]);assert.deepEqual(snapshot.errors,[]);
});
