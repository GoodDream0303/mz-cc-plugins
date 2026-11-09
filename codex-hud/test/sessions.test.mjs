import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import promises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {listSessions,findSession} from '../dist/sessions.js';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-session-head-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
const metadata=payload=>JSON.stringify({type:'session_meta',payload})+'\n';

test('discovery reads only a small metadata head instead of the conversation body',async t=>{
 const root=fixture(t),file=path.join(root,'one.jsonl');fs.writeFileSync(file,metadata({id:'session-one',cwd:'C:/project'})+'x'.repeat(512*1024));
 const open=promises.open;let bytes=0;t.mock.method(promises,'open',async function(...args){const handle=await open.apply(this,args),read=handle.read.bind(handle);handle.read=async(...args)=>{const result=await read(...args);bytes+=result.bytesRead;return result;};return handle;});
 const sessions=await listSessions(root);assert.equal(sessions.length,1);assert.equal(sessions[0].id,'session-one');assert.equal(sessions[0].cwd,'C:/project');
 assert.ok(bytes<=4096,`short metadata must not read the large body (${bytes} bytes read)`);
});

test('chunked discovery preserves large UTF-8 metadata, duplicates and verified parent IDs',async t=>{
 const root=fixture(t),directory=path.join(root,'nested');fs.mkdirSync(directory);
 const payload={padding:'界'.repeat(4000),id:'child-one',cwd:'C:/项目',source:{subagent:{thread_spawn:{parent_thread_id:'parent-one'}}}};
 fs.writeFileSync(path.join(directory,'child.jsonl'),metadata(payload));fs.writeFileSync(path.join(root,'duplicate.jsonl'),metadata(payload));
 fs.writeFileSync(path.join(root,'parent.jsonl'),metadata({id:'parent-one',cwd:'C:/project'}).trimEnd());
 const sessions=await listSessions(root),children=sessions.filter(s=>s.id==='child-one');assert.equal(children.length,2);
 assert.ok(children.every(s=>s.cwd==='C:/项目'&&s.parentId==='parent-one'));assert.equal((await findSession(root,'parent-one')).id,'parent-one');
});

test('over-limit or malformed metadata never becomes a partial session identity',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'oversized.jsonl'),metadata({id:'too-large',padding:'x'.repeat(256*1024)}));
 fs.writeFileSync(path.join(root,'partial.jsonl'),'{"type":"session_meta","payload":{"id":"partial');
 fs.writeFileSync(path.join(root,'valid.jsonl'),metadata({id:'valid-one'}));
 assert.deepEqual((await listSessions(root)).map(s=>s.id),['valid-one']);
});
