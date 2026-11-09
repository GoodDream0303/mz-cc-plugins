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

test('unchanged packaged selections reuse the verified digest while metadata changes require revalidation',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-backend-cache-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binary=path.join(root,'psmux.exe'),pinFile=path.join(root,'psmux-compact.json'),body='binary fixture';fs.writeFileSync(binary,body);
 const fixedTime=new Date(1700000000000);fs.utimesSync(binary,fixedTime,fixedTime);
 const pin={format:1,version:'3.4.0-hud-compact-v1',upstreamCommit:upstream,sha256:createHash('sha256').update(body).digest('hex')};fs.writeFileSync(pinFile,JSON.stringify(pin));
 const original=fs.readFileSync;let binaryReads=0;t.mock.method(fs,'readFileSync',function(file,...args){if(path.resolve(String(file))===binary)binaryReads++;return original.call(this,file,...args);});
 assert.equal(api.packagedBackendPath(root),binary);assert.equal(api.packagedBackendPath(root),binary);
 assert.equal(binaryReads,1,'an unchanged packaged binary is hashed only once');
 fs.writeFileSync(binary,'broken fixture');fs.utimesSync(binary,fixedTime,fixedTime);
 assert.equal(api.packagedBackendPath(root),'','same length and restored mtime do not hide a rewrite');assert.equal(binaryReads,2);
 fs.writeFileSync(binary,body);assert.equal(api.packagedBackendPath(root),binary);
 fs.writeFileSync(pinFile,JSON.stringify({...pin,upstreamCommit:'wrong'}));assert.equal(api.packagedBackendPath(root),'');
 fs.writeFileSync(pinFile,JSON.stringify(pin));assert.equal(api.packagedBackendPath(root),binary);
 const replacement=path.join(root,'replacement.exe');fs.writeFileSync(replacement,'broken fixture');fs.utimesSync(replacement,fixedTime,fixedTime);fs.renameSync(replacement,binary);
 assert.equal(api.packagedBackendPath(root),'','replacement artifacts cannot inherit a cached proof');
 fs.unlinkSync(binary);assert.equal(api.packagedBackendPath(root),'');
});

test('a backend changed during hashing cannot publish a successful cached verification',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-backend-read-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binary=path.join(root,'psmux.exe'),body='binary fixture';fs.writeFileSync(binary,body);
 fs.writeFileSync(path.join(root,'psmux-compact.json'),JSON.stringify({format:1,version:'3.4.0-hud-compact-v1',upstreamCommit:upstream,sha256:createHash('sha256').update(body).digest('hex')}));
 const original=fs.readFileSync;t.mock.method(fs,'readFileSync',function(file,...args){const result=original.call(this,file,...args);if(path.resolve(String(file))===binary)fs.writeFileSync(binary,'broken fixture');return result;});
 assert.equal(api.packagedBackendPath(root),'');assert.equal(api.packagedBackendPath(root),'');
});
