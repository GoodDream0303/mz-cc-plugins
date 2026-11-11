import test from 'node:test';import assert from 'node:assert/strict';import {viewerProbe} from './support/viewer-probe.mjs';
test('a telemetry change updates its rows without clearing the pane or repainting unchanged context',()=>{
 const r=viewerProbe({refreshMs:1000,duration:650});assert.equal(r.frames.length,2);
 assert.doesNotMatch(r.frames[1],/\x1b\[(?:2|3)?J/);assert.match(r.frames[1],/PROBE-MODEL/);
 assert.match(r.frames[0],/Context/);assert.doesNotMatch(r.frames[1],/Context/);
});
test('a viewport resize repaints identical content without clearing the pane',()=>{
 const r=viewerProbe({mode:'resize',refreshMs:1000,duration:650});assert.equal(r.frames.length,2);
 assert.match(r.frames[0],/Context/);assert.match(r.frames[1],/Context/);assert.doesNotMatch(r.frames[1],/\x1b\[(?:2|3)?J/);
});
test('coalesced shrinking and restoration still invalidate identical visible content',()=>{
 const r=viewerProbe({mode:'resize-return',refreshMs:1000,duration:650});assert.equal(r.frames.length,2);assert.match(r.frames[1],/Context/);
});
test('native append refreshes before a full interval and idle heartbeat does not repaint or reparse config',()=>{
 const r=viewerProbe({refreshMs:1000,duration:1250});assert.equal(r.counts.config,1);assert.equal(r.counts.paint,2);assert.equal(r.counts.render,2);assert.ok(r.visibleLatency<800,JSON.stringify(r));
});
test('event bursts and atomic replacement settle to the newest model without redundant paints',()=>{
 const r=viewerProbe({mode:'replace',refreshMs:1000,duration:1250});assert.equal(r.counts.paint,2);assert.ok(r.visibleLatency<800,JSON.stringify(r));
});
test('configuration replacement updates once, while stopping a quiet viewer is prompt',()=>{
 const r=viewerProbe({mode:'config',refreshMs:1000,duration:650});assert.equal(r.counts.config,2);assert.equal(r.counts.paint,2);assert.ok(r.stopLatency<800,JSON.stringify(r));
});
test('a dense append burst is coalesced to the final visible state',()=>{
 const r=viewerProbe({mode:'burst',refreshMs:1000,duration:650});assert.equal(r.counts.paint,2);assert.match(r.frames.at(-1),/PROBE-MODEL/);assert.ok(r.frames.every(frame=>!frame.includes('intermediate-')));
});
test('watcher failure and silently lost notifications both preserve polling fallback',()=>{
 for(const mode of ['fallback','lost']){const r=viewerProbe({mode,refreshMs:250,duration:650});assert.equal(r.counts.paint,2);assert.ok(r.visibleLatency<700,JSON.stringify(r));}
});
test('Recent expiry repaints from a deadline without a new log record',()=>{
 const r=viewerProbe({mode:'expiry',refreshMs:1000,duration:900});assert.match(r.frames[0],/EXPIRY-PROBE/);assert.doesNotMatch(r.frames.at(-1),/EXPIRY-PROBE/);assert.equal(r.counts.paint,2);assert.equal(r.counts.read,1);assert.equal(r.samples[1].configStat,r.samples[0].configStat);
});
test('a child-only completion wakes the viewer and keeps exact parent binding',()=>{
 const r=viewerProbe({mode:'child',refreshMs:1000,duration:1250});assert.match(r.frames[0],/review.*\[running\]/);assert.match(r.frames.at(-1),/review.*\[done\]/);assert.ok(r.visibleLatency<800,JSON.stringify(r));
});
test('an unresolved session with lost notifications is discovered at the configured fallback cadence',()=>{
 const r=viewerProbe({mode:'discovery',refreshMs:250,duration:1050});assert.match(r.frames.at(-1),/PROBE-MODEL/);assert.ok(r.visibleLatency<800,JSON.stringify(r));
});
