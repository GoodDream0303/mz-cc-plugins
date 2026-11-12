import test from 'node:test';import assert from 'node:assert/strict';
import {ImageRecord} from '../dist/image-record.js';

test('image projection preserves escaped strings and property names across every split boundary',()=>{
 const line='{"type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"right","output":[{"type":"input_text","text":"Script failed\\nimage_url: \\\"data:image/png;NOT_AN_IMAGE\\\" 中文"},{"type":"input_image","image_\\u0075rl":"d\\u0061ta:image\\/png;base64,AAAA\\\"BBBB\\\\CCCC\\u0041"}]}}';
 const expected={type:'response_item',payload:{type:'custom_tool_call_output',call_id:'right',output:[{type:'input_text',text:'Script failed\nimage_url: "data:image/png;NOT_AN_IMAGE" 中文'},{type:'input_image',image_url:''}]}};
 for(let split=0;split<=line.length;split++){
  const projection=new ImageRecord(1024);projection.write(line.slice(0,split));projection.write(line.slice(split));assert.deepEqual(JSON.parse(projection.finish()),expected);
 }
 const projection=new ImageRecord(1024);for(const c of line)projection.write(c);assert.deepEqual(JSON.parse(projection.finish()),expected);
});

test('non-inline image URLs and misleading image_url text are preserved exactly',()=>{
 const input={image_url:'https://example.com/a.png',label:'image_url',note:'data:image/png;not-a-property',output:[{image_url:'data:image/png;base64,AAAA'}]},projection=new ImageRecord(1024);
 projection.write(JSON.stringify(input));assert.deepEqual(JSON.parse(projection.finish()),{...input,output:[{image_url:''}]});
});

test('discarded image bodies still require valid JSON escapes and control characters',()=>{
 for(const tail of ['\\q','\\u000X','\\x00','\u0000','\t','\r','\\']){
  const projection=new ImageRecord(1024);projection.write('{"image_url":"data:image/png;base64,AAAA'+tail+'"}');assert.equal(projection.finish(),undefined);
 }
});

test('removing images cannot bypass the retained record limit',()=>{
 const projection=new ImageRecord(64);projection.write('{"image_url":"data:image/png;base64,'+'A'.repeat(10000)+'",');
 assert.equal(projection.failed,false);projection.write('"text":"'+'B'.repeat(1000)+'"}');assert.equal(projection.failed,true);assert.equal(projection.finish(),undefined);
 projection.write('{"image_url":"data:image/png;base64,A"}');assert.equal(projection.finish(),undefined);
});
