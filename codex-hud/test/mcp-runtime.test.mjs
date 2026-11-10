import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../dist/mcp-runtime.js').catch(()=>({}));
const token='x'.repeat(43);
async function fixture(t,reply){
 const {WebSocketServer}=await import('ws'),server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));
 const requests=[];server.on('connection',(socket,request)=>{assert.equal(request.headers.authorization,'Bearer '+token);socket.on('message',data=>{const r=JSON.parse(String(data));requests.push(r);if(r.id===undefined)return;const result=reply(r,socket);if(result!==undefined)socket.send(JSON.stringify({id:r.id,result}));});});
 const client=new api.McpRuntimeClient('ws://127.0.0.1:'+server.address().port,token);
 t.after(async()=>{client.close();for(const socket of server.clients)socket.terminate();await new Promise(r=>server.close(r));});
 return {client,requests,server};
}
const base=r=>r.method==='initialize'?{userAgent:'probe'}:r.method==='thread/loaded/list'?{data:['thread-a'],nextCursor:null}:undefined;
test('read-only runtime projects thread-scoped statuses and omits tool inventory and credentials',async t=>{
 assert.equal(typeof api.McpRuntimeClient,'function');
 const {client,requests}=await fixture(t,r=>base(r)??{data:[{name:'docs',runtimeStatus:'connected',authStatus:'oAuth',tools:{private:{description:'PRIVATE'}}},{name:'codex_apps',runtimeStatus:null}],nextCursor:null});
 const result=await client.read('thread-a');assert.equal(result.sessionId,'thread-a');assert.equal(result.complete,true);assert.deepEqual(result.servers,[{name:'docs',status:'connected'},{name:'codex_apps',status:'unknown'}]);assert.ok(Math.abs(Date.now()-result.checkedAt)<2000);
 assert.ok(requests.every(r=>['initialize','initialized','thread/loaded/list','mcpServerStatus/list'].includes(r.method)));
 assert.deepEqual(requests.find(r=>r.method==='mcpServerStatus/list').params,{threadId:'thread-a',detail:'toolsAndAuthOnly',limit:64});
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private|oAuth|Bearer|xxxxxxxx/);
});
test('runtime follows all pages and refuses a repeated cursor instead of claiming a complete list',async t=>{
 assert.equal(typeof api.McpRuntimeClient,'function');let cycle=false;
 const {client}=await fixture(t,r=>base(r)??(r.params.cursor?{data:[{name:'two',runtimeStatus:'failed'}],nextCursor:cycle?'next':null}:{data:[{name:'one',runtimeStatus:'starting'}],nextCursor:'next'}));
 assert.deepEqual((await client.read('thread-a')).servers,[{name:'one',status:'starting'},{name:'two',status:'failed'}]);cycle=true;await assert.rejects(client.read('thread-a'),/cursor|pagination/i);
});
test('runtime never discovers MCPs for a thread that is not loaded in the same service',async t=>{
 assert.equal(typeof api.McpRuntimeClient,'function');const {client,requests}=await fixture(t,r=>base(r));
 await assert.rejects(client.read('thread-b'),/loaded/i);assert.equal(requests.some(r=>r.method==='mcpServerStatus/list'),false);
});
test('runtime fails closed on partial pages, excessive inventories and invalid status data',async t=>{
 assert.equal(typeof api.McpRuntimeClient,'function');let response={data:Array.from({length:65},(_,i)=>({name:'s'+i,runtimeStatus:'connected'})),nextCursor:null};
 const {client}=await fixture(t,r=>base(r)??response);await assert.rejects(client.read('thread-a'),/limit|large|64/i);
 response={data:[{name:'docs',runtimeStatus:'future-state'}],nextCursor:null};assert.equal((await client.read('thread-a')).servers[0].status,'unknown');
 response={data:[{name:'docs',runtimeStatus:'connected'}],nextCursor:17};await assert.rejects(client.read('thread-a'),/cursor|response/i);
});
test('runtime rejects nonlocal endpoints and never follows an authentication redirect',async()=>{
 assert.equal(typeof api.McpRuntimeClient,'function');for(const endpoint of ['ws://example.com:1234','ws://0.0.0.0:1234','wss://127.0.0.1:1234','ws://u:p@127.0.0.1:1234','ws://127.0.0.1:1234/?token=secret'])assert.throws(()=>new api.McpRuntimeClient(endpoint,token),/endpoint|loopback/i);
});
test('runtime times out unresponsive requests and closes its transport',async t=>{
 assert.equal(typeof api.McpRuntimeClient,'function');const {client}=await fixture(t,r=>base(r));const start=Date.now();await assert.rejects(client.read('thread-a'),/timeout/i);assert.ok(Date.now()-start<4000);
});
test('a known transport disconnect invalidates a fresh connected result immediately',async t=>{
 assert.equal(typeof api.McpRuntimePoller,'function');const {client,server}=await fixture(t,r=>base(r)??{data:[{name:'docs',runtimeStatus:'connected'}],nextCursor:null}),poller=new api.McpRuntimePoller(client);t.after(()=>poller.close());poller.refresh('thread-a');
 for(let i=0;i<50&&!poller.snapshot('thread-a');i++)await new Promise(r=>setTimeout(r,10));assert.equal(poller.snapshot('thread-a')?.servers[0].status,'connected');
 for(const socket of server.clients)socket.terminate();await new Promise(r=>setTimeout(r,30));assert.equal(poller.snapshot('thread-a'),undefined);
});
test('a failed refresh retains only known server names for an unknown-state connection row',async()=>{
 assert.equal(typeof api.McpRuntimePoller.prototype.knownServers,'function');let fail=false;const poller=new api.McpRuntimePoller({read:async sessionId=>{if(fail)throw Error('offline');return {sessionId,checkedAt:1000,complete:true,servers:[{name:'plugin-docs',status:'connected'}]};},close(){}});
 poller.refresh('thread-a',1000);await new Promise(setImmediate);fail=true;poller.refresh('thread-a',6000);await new Promise(setImmediate);assert.equal(poller.snapshot('thread-a',6001),undefined);assert.deepEqual(poller.knownServers('thread-a'),['plugin-docs']);poller.refresh('thread-b',6002);assert.deepEqual(poller.knownServers('thread-b'),[]);poller.close();
});
test('poller clears a switched thread immediately and never overlaps an outstanding request',async()=>{
 assert.equal(typeof api.McpRuntimePoller,'function');let resolve,calls=0;const client={read:()=>{calls++;return new Promise(r=>{resolve=r;});},close(){}};
 const poller=new api.McpRuntimePoller(client);poller.refresh('thread-a',1000);poller.refresh('thread-b',1001);assert.equal(calls,1);assert.equal(poller.snapshot('thread-b',1001),undefined);
 resolve({sessionId:'thread-a',checkedAt:1002,complete:true,servers:[{name:'docs',status:'connected'}]});await new Promise(setImmediate);assert.equal(poller.snapshot('thread-b',1003),undefined);poller.refresh('thread-b',1004);assert.equal(calls,2);poller.close();
});
test('poller expires results after 12 seconds and drops a failed refresh',async()=>{
 assert.equal(typeof api.McpRuntimePoller,'function');let fail=false;const client={read:async id=>{if(fail)throw Error('offline');return {sessionId:id,checkedAt:1000,complete:true,servers:[{name:'docs',status:'connected'}]};},close(){}};
 const poller=new api.McpRuntimePoller(client);poller.refresh('thread-a',1000);await new Promise(setImmediate);assert.equal(poller.snapshot('thread-a',12999)?.servers[0].status,'connected');assert.equal(poller.snapshot('thread-a',13001),undefined);fail=true;poller.refresh('thread-a',6000);await new Promise(setImmediate);assert.equal(poller.snapshot('thread-a',6001),undefined);poller.close();
});
