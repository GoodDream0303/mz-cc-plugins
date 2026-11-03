import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

const api=await import('../dist/backend-version.js').catch(()=>({}));
const upstream='20aa1d7254ee93f64dafa059ef89341d9767470a';
test('upstream backend stays supported and arbitrary compact version claims are rejected',()=>{
 assert.equal(typeof api.verifyBackend,'function','Backend build verification is missing');
 assert.equal(api.verifyBackend('unused','psmux 3.4.0 (20aa1d7 2026-10-13)').kind,'upstream');
 assert.equal(api.verifyBackend('unused','tmux 3.4.0\r\npsmux 3.4.0 (20aa1d7 2026-10-13)\r\n')?.kind,'upstream');
 for(const output of ['psmux 3.5.0 (20aa1d7)','psmux 3.4.0 (abcdef0)','psmux 3.4.0-hud-compact-v1 (20aa1d7)'])assert.equal(api.verifyBackend('missing.exe',output),undefined);
});
test('compact backend requires both the distinct build marker and its pinned file digest',t=>{
 assert.equal(typeof api.verifyBackend,'function','Backend build verification is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-backend-pin-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'psmux.exe');fs.writeFileSync(file,'isolated artifact fixture');
 const pin={format:1,version:'3.4.0-hud-compact-v1',upstreamCommit:upstream,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
 assert.equal(api.verifyBackend(file,'psmux 3.4.0-hud-compact-v1 (20aa1d7)',pin).kind,'compact');
 assert.equal(api.verifyBackend(file,'tmux 3.4.0\npsmux 3.4.0-hud-compact-v1 (20aa1d7)\n',pin)?.kind,'compact');
 assert.equal(api.verifyBackend(file,'psmux 3.4.0-hud-compact-v1 (wrong)',pin),undefined);
 assert.equal(api.verifyBackend(file,'psmux 3.4.0-hud-compact-v1 (20aa1d7)',{...pin,upstreamCommit:'wrong'}),undefined);
 fs.appendFileSync(file,' changed');assert.equal(api.verifyBackend(file,'psmux 3.4.0-hud-compact-v1 (20aa1d7)',pin),undefined);
});

test('packaged backend is selected by default only when its binary exists and matches the pin',t=>{
 assert.equal(typeof api.packagedBackendPath,'function','Packaged backend selection is missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-packaged-backend-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binary=path.join(root,'psmux.exe'),digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(binary,'binary fixture');
 const pin={format:1,version:'3.4.0-hud-compact-v1',upstreamCommit:upstream,sha256:digest(binary)};fs.writeFileSync(path.join(root,'psmux-compact.json'),JSON.stringify(pin));
 assert.equal(api.packagedBackendPath(root),binary);fs.appendFileSync(binary,' changed');assert.equal(api.packagedBackendPath(root),'');
 fs.unlinkSync(binary);assert.equal(api.packagedBackendPath(root),'');
});
