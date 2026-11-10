import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const source=path.dirname(require.resolve('smol-toml'));
const metadata=JSON.parse(fs.readFileSync(path.join(source,'..','package.json'),'utf8'));
if(metadata.name!=='smol-toml'||metadata.version!=='1.9.1')throw new Error('Review the pinned TOML runtime before packaging a new version');
const target=path.join(root,'dist','vendor','smol-toml');
fs.mkdirSync(target,{recursive:true});
for(const entry of fs.readdirSync(source,{withFileTypes:true})){
 if(entry.isFile()&&entry.name.endsWith('.js')){
  const code=fs.readFileSync(path.join(source,entry.name),'utf8').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
  fs.writeFileSync(path.join(target,entry.name),code);
 }
}
fs.copyFileSync(path.join(source,'..','LICENSE'),path.join(target,'LICENSE'));
const environment=path.join(root,'dist','environment.js');
const code=fs.readFileSync(environment,'utf8');
const specifier="from 'smol-toml'";
if(code.split(specifier).length!==2)throw new Error('Unexpected TOML runtime import; review the release output');
fs.writeFileSync(environment,code.replace(specifier,"from './vendor/smol-toml/index.js'"));

const wsRoot=path.dirname(require.resolve('ws/package.json'));
if(JSON.parse(fs.readFileSync(path.join(wsRoot,'package.json'),'utf8')).version!=='8.22.2')throw new Error('Review the pinned WebSocket runtime before packaging a new version');
const wsTarget=path.join(root,'dist','vendor','ws');
fs.mkdirSync(path.join(wsTarget,'lib'),{recursive:true});
for(const relative of ['package.json','LICENSE','index.js','wrapper.mjs',...fs.readdirSync(path.join(wsRoot,'lib')).filter(name=>name.endsWith('.js')).map(name=>'lib/'+name)]){
 const content=fs.readFileSync(path.join(wsRoot,relative),'utf8').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
 fs.writeFileSync(path.join(wsTarget,relative),content);
}
const runtime=path.join(root,'dist','mcp-runtime.js'),runtimeCode=fs.readFileSync(runtime,'utf8');
if(runtimeCode.split("from 'ws'").length!==2)throw new Error('Unexpected WebSocket import; review the release output');
fs.writeFileSync(runtime,runtimeCode.replace("from 'ws'","from './vendor/ws/wrapper.mjs'"));
