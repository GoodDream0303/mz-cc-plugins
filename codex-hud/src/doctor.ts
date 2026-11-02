import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'smol-toml';
export interface HookSetup {status:string;trust:'unknown';pluginId?:string;path?:string;message:string}
export function inspectHookSetup(home:string):HookSetup{
 const result=(status:string,message:string,extra:Partial<HookSetup>={}):HookSetup=>({status,trust:'unknown',message,...extra});
 let config:any={};
 try{const file=path.join(home,'config.toml');if(fs.existsSync(file)){if(fs.statSync(file).size>1024*1024)return result('invalid-config','Codex config.toml is too large');config=parse(fs.readFileSync(file,'utf8'));}}
 catch{return result('invalid-config','Cannot parse Codex config.toml; no settings were changed');}
 const ids=Object.keys(config.plugins??{}).filter(id=>id.startsWith('codex-hud@'));
 if(!ids.length)return result('missing','Install codex-hud@mz-codex-plugins from this repository marketplace');
 const pluginId=ids.find(id=>config.plugins[id]?.enabled!==false)??ids[0];
 if(config.plugins[pluginId]?.enabled===false)return result('disabled','Enable the Codex HUD plugin before launching',{pluginId});
 if(config.features?.hooks===false||config.features?.plugin_hooks===false)return result('hooks-disabled','Codex lifecycle hooks are explicitly disabled',{pluginId});
 const marketplace=pluginId.slice(pluginId.indexOf('@')+1);
 if(!/^[a-zA-Z0-9_-]+$/.test(marketplace))return result('invalid-plugin','Unsupported local marketplace identifier',{pluginId});
 const versionsRoot=path.join(home,'plugins','cache',marketplace,'codex-hud');
 let versions:string[]=[];try{versions=fs.readdirSync(versionsRoot).filter(v=>fs.statSync(path.join(versionsRoot,v)).isDirectory()).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{}
 const root=versions.length?path.join(versionsRoot,versions[0]):undefined;
 if(!root)return result('unbuilt','Installed plugin cache is missing; reinstall this plugin',{pluginId});
 const extra={pluginId,path:root};
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin','plugin.json'),'utf8'));
  const hookPath=typeof manifest.hooks==='string'?path.resolve(root,manifest.hooks):path.join(root,'hooks','hooks.json');
  const relative=path.relative(root,hookPath);if(relative.startsWith('..')||path.isAbsolute(relative))return result('invalid-plugin','Hook manifest path escapes the plugin root',extra);
  const hooks=JSON.parse(fs.readFileSync(hookPath,'utf8'));
  const commands=(hooks.hooks?.SessionStart??[]).flatMap((item:any)=>item.hooks??[]).filter((item:any)=>item.type==='command'&&typeof item.command==='string'&&item.command.includes('session-start.mjs'));
  if(!commands.length)return result('missing-hook','The plugin does not register its SessionStart binding hook',extra);
  if(commands.every((item:any)=>item.enabled===false||item.disabled===true))return result('hooks-disabled','The plugin SessionStart hook is explicitly disabled',extra);
 }catch{return result('invalid-plugin','The cached plugin manifest or hook definition is unreadable',extra);}
 for(const file of ['dist/hook.js','dist/cli.js','hooks/session-start.mjs','node_modules/smol-toml/package.json'])
  if(!fs.existsSync(path.join(root,file)))return result('unbuilt','Build the cached plugin: npm ci --ignore-scripts, then npm run build',extra);
 return result('available','Hook files are available. Review/trust this exact hook in Codex /hooks; trust is not inferred from files',extra);
}
