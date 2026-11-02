import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {inspectHookSetup} from '../dist/doctor.js';
test('doctor distinguishes missing/disabled/unbuilt hook prerequisites and never claims hook trust',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hud-doctor-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));assert.equal(inspectHookSetup(home).status,'missing');
 fs.writeFileSync(path.join(home,'config.toml'),'[plugins."codex-hud@mz-codex-plugins"]\nenabled = false\n');assert.equal(inspectHookSetup(home).status,'disabled');
 fs.writeFileSync(path.join(home,'config.toml'),'[plugins."codex-hud@mz-codex-plugins"]\nenabled = true\n');const p=path.join(home,'plugins/cache/mz-codex-plugins/codex-hud/0.1.0');fs.mkdirSync(path.join(p,'hooks'),{recursive:true});fs.mkdirSync(path.join(p,'.codex-plugin'),{recursive:true});fs.writeFileSync(path.join(p,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-hud',version:'0.1.0',hooks:'./hooks/hooks.json'}));fs.writeFileSync(path.join(p,'hooks/hooks.json'),JSON.stringify({hooks:{SessionStart:[{hooks:[{type:'command',command:'node "${PLUGIN_ROOT}/hooks/session-start.mjs"'}]}]}}));assert.equal(inspectHookSetup(home).status,'unbuilt');
 for(const file of ['dist/hook.js','dist/cli.js','hooks/session-start.mjs','node_modules/smol-toml/package.json']){fs.mkdirSync(path.dirname(path.join(p,file)),{recursive:true});fs.writeFileSync(path.join(p,file),'{}');}
 const ready=inspectHookSetup(home);assert.equal(ready.status,'available');assert.equal(ready.trust,'unknown');
 fs.writeFileSync(path.join(home,'config.toml'),'[features]\nhooks = false\n[plugins."codex-hud@mz-codex-plugins"]\nenabled = true\n');assert.equal(inspectHookSetup(home).status,'hooks-disabled');
 fs.writeFileSync(path.join(home,'config.toml'),'not valid TOML ===');assert.equal(inspectHookSetup(home).status,'invalid-config');
});
