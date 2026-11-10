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

test('discovery overlaps metadata reads with at most eight open handles and closes failures',async t=>{
 const root=fixture(t);for(let i=0;i<24;i++)fs.writeFileSync(path.join(root,String(i).padStart(2,'0')+'.jsonl'),metadata({id:'session-'+i}));
 const open=promises.open;let active=0,peak=0,closed=0;
 t.mock.method(promises,'open',async(...args)=>{const handle=await open(...args),close=handle.close.bind(handle);active++;peak=Math.max(peak,active);handle.close=async()=>{try{return await close();}finally{active--;closed++;}};if(path.basename(args[0])==='03.jsonl')handle.read=async()=>{throw Object.assign(Error('synthetic read failure'),{code:'EIO'});};return handle;});
 const sessions=await listSessions(root);assert.equal(sessions.length,23);assert.equal(active,0);assert.equal(closed,24);assert.ok(peak>1,'metadata reading is still serial');assert.ok(peak<=8,'metadata concurrency is unbounded');
});

test('equal-time metadata retains enumeration order even when earlier reads finish last',async t=>{
 const root=fixture(t),time=new Date('2026-11-10T00:00:00Z');
 for(const name of ['a','b','c']){const file=path.join(root,name+'.jsonl');fs.writeFileSync(file,metadata({id:'duplicate-id',cwd:name}));fs.utimesSync(file,time,time);}
 const expected=fs.readdirSync(root).filter(name=>name.endsWith('.jsonl')).map(name=>path.basename(name,'.jsonl')),open=promises.open;
 t.mock.method(promises,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);if(path.basename(args[0])===expected[0]+'.jsonl')handle.read=async(...values)=>{await new Promise(resolve=>setTimeout(resolve,20));return read(...values);};return handle;});
 assert.deepEqual((await listSessions(root)).map(s=>s.cwd),expected);assert.equal((await findSession(root,'duplicate-id')).cwd,expected[0]);
});

test('each discovery sees delayed files and same-size same-time metadata replacements',async t=>{
 const root=fixture(t),file=path.join(root,'arbitrary-name.jsonl'),time=new Date('2026-11-10T00:00:00Z');fs.writeFileSync(file,metadata({id:'first-id'}));fs.utimesSync(file,time,time);
 assert.deepEqual((await listSessions(root)).map(s=>s.id),['first-id']);
 fs.writeFileSync(file,metadata({id:'other-id'}));fs.utimesSync(file,time,time);fs.writeFileSync(path.join(root,'not-the-id.jsonl'),metadata({id:'delayed-id',source:{subagent:{thread_spawn:{parent_thread_id:'other-id'}}}}));
 const sessions=await listSessions(root);assert.deepEqual(sessions.map(s=>s.id).sort(),['delayed-id','other-id']);assert.equal(sessions.find(s=>s.id==='delayed-id').parentId,'other-id');
});
