import type {ToolAction,ToolOperation} from './types.js';

const maxInput=32768,maxTokens=1024;
export function commandOperation(action:ToolAction):ToolOperation {
 if(['nodeTest','npmTest','pythonTest'].includes(action.kind))return 'test';
 if(action.kind==='patch')return 'write';
 if(['node','python','powershell','shell','mixed'].includes(action.kind)||action.kind.startsWith('agent'))return 'other';
 return action.kind as ToolOperation;
}
function combine(actions:(ToolAction|undefined)[]):ToolAction|undefined {
 const known=actions.filter((action):action is ToolAction=>!!action);if(!known.length)return;
 if(actions.length===1)return known[0];
 const operations=[...new Set(actions.flatMap(action=>action?.operations??[action?commandOperation(action):'other']))];
 if(operations.length===1){const first=known[0];return known.every(action=>action.kind===first.kind&&action.target===first.target)?first:{kind:operations[0]};}
 return {kind:'mixed',operations};
}
function basename(value:unknown):string|undefined {
 if(typeof value!=='string')return;
 const name=value.replaceAll('\\','/').split('/').at(-1)??'';
 return /^[\p{L}\p{N}_.() -]{1,64}$/u.test(name)&&!/^(?:ghp_|github_pat_|sk-)/i.test(name)?name:undefined;
}
const verbs=new Set(['status','diff','log','show','add','commit','fetch','push','pull','merge','rebase','checkout','switch','branch','restore','reset','rev-parse','ls-remote','cat-file','worktree','tag','stash']);
const commands=new Map<string,ToolOperation>();
for(const [kind,names]of Object.entries({
 read:['get-content','gc','cat','type','head','tail','less','more'],
 search:['select-string','sls','grep','findstr'],list:['get-childitem','gci','ls','dir','find','get-item','get-location','pwd'],
 write:['set-content','add-content','out-file','new-item','touch','mkdir','tee'],copy:['copy-item','cp','copy','xcopy','robocopy'],move:['move-item','rename-item','mv','move','ren'],delete:['remove-item','rm','rmdir','del','erase'],
 archive:['compress-archive','expand-archive','tar','zip','unzip','7z'],check:['get-filehash','test-path','compare-object','sha256sum','cmp','diff','eslint'],
 build:['make','ninja','msbuild'],benchmark:['measure-command','hyperfine'],environment:['get-command','where','which','get-ciminstance','get-computerinfo','printenv','uname'],
 process:['get-process','start-process','stop-process','get-service','start-service','stop-service','restart-service','ps','tasklist','taskkill','kill'],
 network:['invoke-webrequest','invoke-restmethod','curl','wget','ping','test-connection','ssh','scp'],wait:['start-sleep','sleep'],
}))for(const name of names)commands.set(name,kind as ToolOperation);

type Token={value:string;quoted?:boolean};
function shellTokens(source:string):Token[]|undefined {
 if(source.length>maxInput||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source))return;
 const tokens:Token[]=[];let i=0;
 while(i<source.length&&tokens.length<maxTokens){
  const c=source[i];if(/[ \t\r]/.test(c)){i++;continue;}
  if(/[{}()`]/.test(c)||source.startsWith('<#',i)||c==='@'&&/["']/.test(source[i+1]??'')||c==='>'&&/^>\s*(?:&|\$null\b)/i.test(source.slice(i)))return;
  if(c==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
  if(/[;|&\n<>]/.test(c)){tokens.push({value:c});i++;continue;}
  let value='',quoted=false;
  while(i<source.length&&!/[ \t\r\n;|&<>]/.test(source[i])){
   const quote=source[i];
   if(quote==='"'||quote==="'"){
    quoted=true;i++;let closed=false;
    while(i<source.length){
     if(quote==='"'&&(source.startsWith('$(',i)||source[i]==='`')||source[i]==='\\'&&source[i+1]===quote)return;
     if(source[i]===quote){if(source[i+1]===quote){value+=quote;i+=2;continue;}i++;closed=true;break;}
     value+=source[i++];
    }
    if(!closed)return;
   }else value+=source[i++];
  }
  tokens.push({value,quoted});
 }
 return i===source.length?tokens:undefined;
}

function argvDetails(args:string[],depth:number):ToolAction|undefined {
 if(depth>3||!args.length||args.length>maxTokens||args.some(arg=>arg.length>maxInput))return;
 const filename=args[0].replaceAll('\\','/').split('/').at(-1)!.toLowerCase();
 if(/\.(?:ps1|bat)$/.test(filename)||filename.endsWith('.cmd')&&!['npm.cmd','pnpm.cmd','yarn.cmd'].includes(filename))return;
 const executable=filename.replace(/\.(?:exe|cmd)$/,'');
 const rest=args.slice(1),lower=rest.map(arg=>arg.toLowerCase());
 if(['powershell','pwsh','bash','sh','cmd'].includes(executable)){
  const powershell=['powershell','pwsh'].includes(executable);
  const at=lower.findIndex(arg=>executable==='cmd'?arg==='/c':powershell?['-command','-c','-file','-f','-encodedcommand','-ec'].includes(arg):/^-[a-z]*c[a-z]*$/.test(arg));
  const nested=at>=0&&(!powershell||['-command','-c'].includes(lower[at]))?rest.slice(at+1):[];
  const action=nested.length===1?shellDetails(nested[0],depth+1):nested.length?argvDetails(nested,depth+1):undefined;
  return action??{kind:['powershell','pwsh'].includes(executable)?'powershell':'shell'};
 }
 if(['--version','-v','-version'].includes(lower[0]))return {kind:'environment'};
 if(executable==='git'){
  let i=0;while(['-C','-c','--git-dir','--work-tree'].includes(rest[i]))i+=2;
  const target=verbs.has(rest[i])?rest[i]:undefined;return {kind:'git',...(target?{target}:{})};
 }
 if(executable==='rg')return {kind:lower.includes('--files')?'list':'search'};
 if(executable==='node')return {kind:lower[0]==='--test'?'nodeTest':'node'};
 if(['python','python3','py'].includes(executable))return {kind:lower[0]==='-m'&&['pytest','unittest'].includes(lower[1])?'pythonTest':'python'};
 if(['pytest','jest','vitest'].includes(executable))return {kind:'test'};
 if(['npm','pnpm','yarn'].includes(executable)){
  const verb=lower[0]==='run'?lower[1]:lower[0];
  if(verb==='test')return {kind:'npmTest'};
  if(verb==='build')return {kind:'build'};
  if(['lint','typecheck','check'].includes(verb))return {kind:'check'};
  if(['install','ci','add','update','upgrade','remove','uninstall'].includes(verb))return {kind:'install'};
 }
 if(executable==='tsc')return {kind:lower.includes('--noemit')?'check':'build'};
 if(executable==='cmake')return {kind:'build'};
 if(executable==='ctest')return {kind:'test'};
 if(executable==='prettier')return {kind:lower.includes('--write')?'write':'check'};
 const kind=commands.get(executable);return kind?{kind}:undefined;
}
function shellDetails(source:string,depth=0):ToolAction|undefined {
 const tokens=shellTokens(source);if(!tokens)return;
 const actions:(ToolAction|undefined)[]=[],statement:Token[]=[];let call=false;
 const flush=()=>{
  if(statement.length){actions.push(statement[0].quoted&&!call?undefined:argvDetails(statement.map(t=>t.value),depth));statement.length=0;}
  call=false;
 };
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];
  if(!token.quoted&&[';','|','\n','&'].includes(token.value)){const invoking=token.value==='&'&&!statement.length;flush();call=invoking;continue;}
  if(!token.quoted&&['>','<'].includes(token.value)){flush();actions.push({kind:token.value==='>'?'write':'read'});if(tokens[i+1]?.value===token.value)i++;i++;continue;}
  statement.push(token);
 }
 flush();return combine(actions);
}

export function structuredCommandDetails(actions:unknown):ToolAction|undefined {
 if(Array.isArray(actions)&&actions.length<=maxTokens){
  const known=actions.filter(action=>action&&['read','search','list'].includes(action.type));
  if(known.length)return combine(actions.map(action=>{if(!known.includes(action))return;const target=basename(action.path);return {kind:action.type,...(target?{target}:{})};}));
 }
}
/** Static, bounded classification only. Never retain raw input or execute it. */
export function commandDetails(command:unknown,actions?:unknown):ToolAction|undefined {
 const structured=structuredCommandDetails(actions);if(structured)return structured;
 if(Array.isArray(command)&&command.every(arg=>typeof arg==='string'))return argvDetails(command,0);
 if(typeof command==='string')return shellDetails(command);
}

function scriptTokens(source:string):Token[]|undefined {
 if(source.length>maxInput)return;
 const tokens:Token[]=[];const pattern=/\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\p{L}_$][\p{L}\p{N}_$]*|=>|[^\s]/guy;
 let match:RegExpExecArray|null;
 while((match=pattern.exec(source))){
  const raw=match[0];if(/^\s|^\/\//.test(raw)||raw.startsWith('/*'))continue;
  if(['"',"'",'`'].includes(raw[0])){
   if(raw.length<2)return;
   if(raw[0]==='`'&&raw.includes('${'))return;
   let invalid=false;
   const value=raw.slice(1,-1).replace(/\\([\s\S])/g,(_whole,escaped:string)=>{
    const simple:Record<string,string>={n:'\n',r:'\r',t:'\t','\\':'\\',"'":"'",'"':'"','`':'`','/':'/'};
    if(!Object.hasOwn(simple,escaped)){invalid=true;return '';}
    return simple[escaped];
   });
   if(invalid)return;tokens.push({value,quoted:true});
  }else tokens.push({value:raw});
  if(tokens.length>maxTokens)return;
 }
 return pattern.lastIndex===0?tokens:undefined;
}
export function scriptDetails(script:unknown):ToolAction|undefined {
 if(typeof script!=='string')return;
 const tokens=scriptTokens(script);if(!tokens||tokens.some(t=>!t.quoted&&['function','class','if','for','while','switch','=>','/','&','|','?'].includes(t.value)))return;
 const actions:(ToolAction|undefined)[]=[];
 for(let i=0;i<tokens.length-4;i++){
  if(tokens[i].quoted||tokens[i].value!=='tools'||tokens[i-1]?.value==='.'||tokens[i+1].value!=='.'||tokens[i+2].quoted||tokens[i+3].value!=='(')continue;
  const name=tokens[i+2].value;
  if(name==='apply_patch'){actions.push({kind:'patch'});continue;}
  if(name!=='exec_command'){actions.push(undefined);continue;}
  if(tokens[i+4].value!=='{'){actions.push(undefined);continue;}
  let depth=1,command:Token|undefined,properties=0;
  for(let j=i+5;j<tokens.length&&depth;j++){
   const token=tokens[j];
   if(!token.quoted&&['{','[','('].includes(token.value))depth++;
   if(!token.quoted&&['}',']',')'].includes(token.value))depth--;
   if(depth===1&&token.value==='cmd'&&tokens[j+1]?.value===':'){properties++;command=[',','}'].includes(tokens[j+3]?.value)?tokens[j+2]:undefined;}
   if(depth===1&&token.value==='.'&&tokens[j+1]?.value==='.')properties+=2;
  }
  actions.push(properties===1&&command?.quoted?commandDetails(command.value):undefined);
 }
 return combine(actions);
}
