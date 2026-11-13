import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(root,'native/process-events.c'),binary=path.join(root,'backend/process-events.exe'),manifest=path.join(root,'backend/process-events.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const index=process.argv.indexOf('--zig'),zig=index<0?undefined:process.argv[index+1];
if(zig){
 if(!path.isAbsolute(zig))throw Error('Supply the absolute portable Zig executable path');
 const version=spawnSync(zig,['version'],{encoding:'utf8',windowsHide:true});if(version.status!==0)throw Error('Could not read compiler version');
 const args=['cc','-target','x86_64-windows-gnu','-Os','-s','-Wall','-Wextra','-Werror',source,'-o',binary];
 const built=spawnSync(zig,args,{cwd:root,windowsHide:true,stdio:'inherit'});if(built.status!==0)process.exit(built.status??1);
 const pin={format:1,protocol:1,platform:'win32-x64',sha256:sha(binary),sourceSha256:sha(source),compiler:{name:'Zig',version:version.stdout.trim(),sha256:sha(zig),command:args.map(v=>v===source?'native/process-events.c':v===binary?'backend/process-events.exe':v)}};
 fs.writeFileSync(manifest,JSON.stringify(pin,null,2)+'\n');
}
const pin=JSON.parse(fs.readFileSync(manifest,'utf8'));
if(pin.format!==1||pin.protocol!==1||pin.platform!=='win32-x64'||sha(binary)!==pin.sha256||sha(source)!==pin.sourceSha256)throw Error('Native process helper is stale or invalid; rebuild with node scripts/build-process.mjs --zig ABSOLUTE_ZIG_EXE');
console.log('Native process helper source and binary verified');
