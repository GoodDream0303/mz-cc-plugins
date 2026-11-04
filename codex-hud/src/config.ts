import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {packagedBackendPath} from './backend-version.js';

export type Config = Record<string, unknown>;
export interface Definition {
  key:string; section:string; label:string; value:unknown;
  kind:'boolean'|'number'|'string'|'array'|'color'; choices?:unknown[]; min?:number; max?:number; pattern?:RegExp;reason?:string;
}
const defs:Definition[]=[];
function def(key:string,value:unknown,section:string,label:string,extra:Partial<Definition>={}) {
  const english=key.split('.').at(-1)!.replace(/^show(?=[A-Z])/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
  defs.push({key,value,section,label:english.charAt(0).toUpperCase()+english.slice(1),kind:Array.isArray(value)?'array':typeof value as Definition['kind'],...extra});
}
def('language','en','layout','Language',{choices:['en','zh-Hans','zh-Hant']});
def('lineLayout','expanded','layout','展开 / 紧凑',{choices:['expanded','compact']});
def('showSeparators',false,'layout','分隔线');
def('pathLevels',1,'layout','目录层数',{choices:[1,2,3,'full']});
def('maxWidth',0,'layout','最大宽度（0=自动）',{min:0,max:1000});
def('forceMaxWidth',false,'layout','Maximum width override',{reason:'Reserved: rendering always respects the actual viewport width'});
def('elementOrder',['project','addedDirs','context','usage','promptCache','memory','environment','tools','skills','mcp','agents','todos','sessionTime'],'layout','元素顺序');
def('projectLineOrder',[],'layout','首行顺序');
def('display.mergeGroups',[['context','usage']],'layout','同行分组');
def('display.rightAlign',[],'layout','靠右元素');
for (const [key,value,label] of [
 ['enabled',true,'Git'],['showDirty',true,'修改标记'],['showAheadBehind',false,'领先 / 落后'],
 ['showFileStats',false,'文件统计'],['branchOverflow','truncate','分支溢出'],['pushWarningThreshold',0,'推送警告阈值'],['pushCriticalThreshold',0,'推送严重阈值']
] as const) def('gitStatus.'+key,value,'git',label,key==='branchOverflow'?{choices:['truncate','wrap']}:typeof value==='number'?{min:0,max:100000}:{});
const unavailable:Record<string,string>={
 showSkills:'Codex does not expose reliable active-Skill events',showMemoryUsage:'Other-process memory inspection is not supported',
 showPromptCache:'Codex does not expose authoritative cache expiry',showSpeed:'Reliable generation-only duration is unavailable',
 showCost:'Authoritative billing data is unavailable',showRoutedCost:'Authoritative billing data is unavailable',showDailyCost:'Authoritative billing data is unavailable',
 showAuthUser:'Authentication credentials are not read',showOutputStyle:'Claude-specific setting',showAdvisor:'Claude-specific feature',
 showModelScopedUsage:'Per-model quota data is unavailable',showAddedDirs:'Additional work directories are not reported',
 showConfigCounts:'Loaded configuration counts are not reported'
};
const flags:Record<string,boolean>={
 showModel:false,showProject:false,showAddedDirs:false,showContextBar:true,showConfigCounts:false,
 showCost:false,showRoutedCost:false,showDailyCost:false,showDuration:false,showSpeed:false,
 showTokenBreakdown:true,showUsage:true,showFiveHourUsage:true,showSevenDayUsage:true,usageBarEnabled:true,showResetLabel:true,usageCompact:false,
 showModelScopedUsage:false,showTools:false,showSkills:false,showMcp:false,showAgents:false,showTodos:false,
 showSessionName:false,showAuth:false,showAuthUser:false,showCodexVersion:false,
 showEffortLevel:false,showMemoryUsage:false,showPromptCache:false,showSessionTokens:false,
 showOutputStyle:false,showSessionStartDate:false,showLastResponseAt:false,showCompactions:false,
 showProvider:false,showClockSeconds:false,showAdvisor:false
};
const labels:Record<string,string>={
 showModel:'模型',showProject:'项目',showContextBar:'上下文',showEffortLevel:'推理强度',
 showSessionTokens:'会话累计 Token',showTokenBreakdown:'Token 明细',showUsage:'额度',showResetLabel:'重置标签',
 usageBarEnabled:'额度进度条',usageCompact:'紧凑额度',showTools:'工具活动',showMcp:'MCP',showAgents:'子代理',
 showTodos:'待办进度',showDuration:'会话时长',showSessionId:'会话 ID',showSessionName:'会话名称',
 showCodexVersion:'Codex 版本',showCompactions:'压缩次数',showAuth:'订阅类型',showProvider:'服务商',
 showSessionStartDate:'会话开始时间',showLastResponseAt:'最后响应时间'
};
const quotaLabels:Record<string,string>={showUsage:'Quota master switch',showFiveHourUsage:'5-hour quota',showSevenDayUsage:'7-day quota'};
for(const [key,value] of Object.entries(flags)) def('display.'+key,value,'display',labels[key]??key,{reason:unavailable[key],...(quotaLabels[key]?{label:quotaLabels[key]}:{})});
for(const [key,value,choices] of [
 ['contextValue','percent',['percent','tokens','remaining','both']],['usageValue','percent',['percent','remaining']],
 ['effortFormat','full',['full','symbol','text']],['modelFormat','full',['full','compact','short']],
 ['timeFormat','relative',['relative','absolute','both','elapsed','elapsedAndAbsolute']],
 ['hourCycle','auto',['auto','h11','h12','h23','h24']],['customLinePosition','last',['first','last']],
 ['addedDirsLayout','inline',['inline','line']]
] as const) def('display.'+key,value,'display',key,{choices:[...choices]});
for(const [key,value,max] of [
 ['toolNameMaxLength',0,200],['toolsMaxVisible',4,30],['authUserLength',8,100],
 ['contextWarningThreshold',70,100],['contextCriticalThreshold',85,100],['usageThreshold',0,100],
 ['sevenDayThreshold',0,100],['environmentThreshold',0,100]
] as const) def('display.'+key,value,'display',key,{min:0,max});
for(const key of ['modelOverride','providerName','customLine','advisorOverride','externalUsagePath','externalUsageWritePath'])
 def('display.'+key,'','display',key,{reason:key.startsWith('externalUsage')?'Preserved only; external path I/O is disabled':key==='advisorOverride'?unavailable.showAdvisor:undefined});
for(const [key,value] of Object.entries({context:'green',usage:'brightBlue',warning:'yellow',usageWarning:'brightMagenta',critical:'red',model:'cyan',project:'yellow',git:'magenta',gitBranch:'cyan',label:'dim',custom:208}))
 def('colors.'+key,value,'colors',key,{kind:'color'});
def('colors.barFilled','█','colors','进度条填充');def('colors.barEmpty','░','colors','进度条空白');
def('terminal.paneSize',0.22,'terminal','下方面板比例',{min:0.1,max:0.75});
def('terminal.initialRows',6,'terminal','Initial HUD rows',{min:0,max:1000});
def('terminal.autoHeight',false,'terminal','Fit initial pane to content');
def('terminal.dynamicHeight',false,'terminal','Follow visible content height');
def('terminal.refreshMs',1000,'terminal','刷新间隔（毫秒）',{min:250,max:60000});
def('terminal.margin',4,'terminal','预留列数',{min:0,max:20});
def('startup.enabled',true,'startup','Auto open HUD',{label:'Legacy startup',reason:'Preserved for compatibility; use exact-host Auto start and keep this false while 0.3.4 sessions exist'});
def('startup.window','last','startup','Terminal target',{pattern:/^[a-zA-Z0-9_.-]{1,100}$/,reason:'Legacy value preserved; attachment uses the verified source pane'});
def('host.psmuxPath',packagedBackendPath(),'startup','Portable psmux executable');
def('host.autoStart','inherit','startup','Exact host automatic opening',{choices:['inherit','enabled','disabled']});
export const definitions:readonly Definition[]=defs;
export const unsupported=unavailable;
const unsafe=new Set(['__proto__','prototype','constructor']);
function inspect(value:unknown,depth=0):void {
 if(depth>12) throw new Error('Configuration nesting is too deep');
 if(value!==null&&typeof value==='object') for(const [key,item] of Object.entries(value)) {
  if(unsafe.has(key)) throw new Error('Unsafe configuration key: '+key);inspect(item,depth+1);
 }
}
export function get(config:Config,key:string):any {
 let value:any=config;for(const part of key.split('.')) {if(unsafe.has(part))throw new Error('Unsafe configuration key');value=value?.[part];}return value;
}
function put(config:Config,key:string,value:unknown):void {
 const parts=key.split('.');let at:any=config;
 for(const part of parts.slice(0,-1)){if(unsafe.has(part))throw new Error('Unsafe configuration key');if(!at[part]||typeof at[part]!=='object'||Array.isArray(at[part]))at[part]={};at=at[part];}
 const last=parts.at(-1)!;if(unsafe.has(last))throw new Error('Unsafe configuration key');at[last]=structuredClone(value);
}
export function defaultConfig():Config {const config:Config={};for(const d of defs)put(config,d.key,d.value);return config;}
export function startupEnabled(config:Config):boolean {const mode=get(config,'host.autoStart')??'inherit';return mode==='enabled'||mode==='inherit'&&!!get(config,'startup.enabled');}
function merge(target:Config,source:Config):Config {
 for(const [key,value] of Object.entries(source)) {
  if(value&&typeof value==='object'&&!Array.isArray(value)&&target[key]&&typeof target[key]==='object'&&!Array.isArray(target[key]))
   merge(target[key] as Config,value as Config);
  else target[key]=structuredClone(value);
 }return target;
}
export function validateConfig(value:unknown):Config {
 inspect(value);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Configuration must be a JSON object');
 if(Buffer.byteLength(JSON.stringify(value))>65536)throw new Error('Configuration exceeds 64 KiB');
 const config=merge(defaultConfig(),value as Config);
 for(const group of ['display','gitStatus','colors','terminal'])if(!config[group]||typeof config[group]!=='object'||Array.isArray(config[group]))throw new Error('Invalid configuration group: '+group);
 for(const d of defs) {
  const v=get(config,d.key);if(d.choices){if(!d.choices.includes(v))throw new Error('Invalid option: '+d.key);continue;}
  if(d.kind==='color'){if(!(typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=255)&&!(typeof v==='string'&&(/^(dim|red|green|yellow|magenta|cyan|brightBlue|brightMagenta)$/.test(v)||/^#[0-9a-f]{6}$/i.test(v))))throw new Error('Invalid color: '+d.key);continue;}
  if(d.kind==='array'){if(!Array.isArray(v))throw new Error('Expected array: '+d.key);if(d.key==='display.mergeGroups'? !v.every(g=>Array.isArray(g)&&g.every(x=>typeof x==='string')) : !v.every(x=>typeof x==='string'))throw new Error('Invalid ordering array: '+d.key);}
  else if(typeof v!==d.kind)throw new Error('Invalid type: '+d.key);
  if(typeof v==='number'&&(!Number.isFinite(v)||v<(d.min??-Infinity)||v>(d.max??Infinity)))throw new Error('Out of range: '+d.key);
  if(d.key==='terminal.initialRows'&&!Number.isInteger(v))throw new Error('Expected whole rows: '+d.key);
  if(typeof v==='string'&&v.length>1000)throw new Error('Text is too long: '+d.key);
  if(typeof v==='string'&&d.pattern&&!d.pattern.test(v))throw new Error('Invalid value: '+d.key);
 }
 return config;
}
export function set(config:Config,key:string,value:unknown):Config {const copy=structuredClone(config);put(copy,key,value);return validateConfig(copy);}
export function configPath(environment:NodeJS.ProcessEnv=process.env):string{
 const selected=environment.MZ_HUD_CONFIG_FILE;if(selected){if(!path.isAbsolute(selected))throw new Error('HUD configuration override must be an absolute path');return selected;}
 return path.join(environment.LOCALAPPDATA??path.join(os.homedir(),'.local','share'),'mz-codex-hud','config.json');
}
export function loadConfig(file=configPath()):Config {
 try {const stat=fs.statSync(file);if(stat.size>65536)throw new Error('Configuration exceeds 64 KiB');return validateConfig(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return defaultConfig();throw e;}
}
export function saveConfig(file:string,config:Config):void {
 const valid=validateConfig(config);let serialized=JSON.stringify(valid,null,2)+'\n';
 if(Buffer.byteLength(serialized)>65536)serialized=JSON.stringify(valid)+'\n';
 if(Buffer.byteLength(serialized)>65536)throw new Error('Configuration exceeds 64 KiB after normalization');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file)&&!fs.existsSync(file+'.bak'))fs.copyFileSync(file,file+'.bak',fs.constants.COPYFILE_EXCL);
 const temp=file+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,serialized,{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
 finally{try{fs.unlinkSync(temp);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
}
export function preset(name:string,base=defaultConfig()):Config {
 if(!['full','essential','minimal'].includes(name))throw new Error('Unknown preset: '+name);
 const config=structuredClone(base);
 for(const d of defs.filter(d=>d.key.startsWith('display.show')&&d.kind==='boolean'))
  put(config,d.key,!d.reason&&(name==='full'||['display.showContextBar',...(name==='essential'?['display.showUsage','display.showFiveHourUsage','display.showSevenDayUsage','display.showSessionTokens']:[])].includes(d.key)));
 return validateConfig(config);
}
export interface ImportRow {key:string;status:'mapped'|'unavailable'|'unknown';reason?:string}
export function importClaude(value:unknown):{config:Config;report:ImportRow[]} {
 inspect(value);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected claude-hud config.json');
 const source=structuredClone(value) as Config;
 if('env' in source||'statusLine' in source)throw new Error('This is Claude settings.json; choose claude-hud/config.json instead');
 if(get(source,'display.showClaudeCodeVersion')!==undefined)put(source,'display.showCodexVersion',get(source,'display.showClaudeCodeVersion'));
 if(source.maxWidth===null)source.maxWidth=0;
 const report:ImportRow[]=[];
 function walk(obj:Config,prefix=''){for(const [key,v]of Object.entries(obj)){const full=prefix?prefix+'.'+key:key;if(v&&typeof v==='object'&&!Array.isArray(v)){walk(v as Config,full);continue;}const d=defs.find(d=>d.key===full);report.push({key:full,status:d?(d.reason?'unavailable':'mapped'):'unknown',reason:d?.reason});}}
 walk(source);
 return {config:validateConfig(source),report};
}
