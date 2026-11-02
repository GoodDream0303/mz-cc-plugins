import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {registerHost} from '../../dist/host-session.js';import {updateLaunch} from '../../dist/runtime.js';
export function hostFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hud-bound-auto-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=path.join(root,'runtime'),origin={binary:path.join(root,'psmux.exe'),dataDir:path.join(root,'data'),hostDir:path.join(runtime,'hosts'),namespace:'mzhud-test',tmux:'/tmp/psmux-101/mzhud-test,53001,0',session:'codex',pane:'%1',originId:randomUUID()};
 const owner={pid:201,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:01.000Z'},server={pid:101,parentPid:1,name:'psmux.exe',startedAt:'2026-11-03T01:00:00.000Z'},frontend={pid:301,parentPid:201,name:'codex.exe',startedAt:'2026-11-03T01:00:02.000Z'},hook={pid:401,parentPid:301,name:'node.exe',startedAt:'2026-11-03T01:00:03.000Z'};
 const record=registerHost({origin,owner,server,window:'@1'},origin.hostDir,root),state={splits:0,viewers:[],pending:undefined,delay:false};
 const environment={MZ_HUD_PSMUX:origin.binary,PSMUX_DATA_DIR:origin.dataDir,MZ_HUD_HOST_DIR:origin.hostDir,MZ_HUD_NAMESPACE:origin.namespace,TMUX:origin.tmux,TMUX_PANE:origin.pane,PSMUX_SESSION:origin.session,MZ_HUD_ORIGIN:origin.originId};
 const acknowledge=(file,view)=>updateLaunch(file,d=>{d.state='running';d.pid=view.pid;d.host.hudPane=view.pane;d.host.hudProcess={pid:view.pid,parentPid:view.parentPid,name:view.name,startedAt:view.startedAt};d.host.phase='running';});
 const dependencies={pid:401,processes:()=>[hook,frontend,owner,server,...state.viewers],run:args=>{
  if(args[2]==='display-message'){
   const pane=args[args.indexOf('-t')+1];if(pane==='%1')return 'codex\t@1\t%1\t201\t120\t40\t101';
   const view=state.viewers.find(v=>v.pane===pane);if(!view)throw Error('pane missing');return `codex\t@1\t${pane}\t${view.pid}\t120\t4\t101`;
  }
  if(args[2]!=='split-window')throw Error('Unexpected command');state.splits++;
  const file=Buffer.from(args[args.indexOf('--launch64')+1],'base64').toString(),view={pid:500+state.splits,parentPid:101,name:'node.exe',startedAt:'2026-11-03T01:00:04.000Z',pane:'%'+(6+state.splits)};state.viewers.push(view);
  if(state.delay)state.pending={file,view};else acknowledge(file,view);return view.pane;
 }};
 return {root,runtime,record,state,environment,dependencies,ack:()=>{acknowledge(state.pending.file,state.pending.view);state.pending=undefined;}};
}
