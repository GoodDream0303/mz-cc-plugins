import {get,type Config} from './config.js';
import {readHost} from './host-session.js';
import {PsmuxClient,readProcessIdentitiesAsync,samePath,verifyHost,hostProcessIds,type HostDependencies} from './psmux.js';
import type {LaunchDescriptor} from './runtime.js';

/** Resize only this viewer's registered two-pane stack; fixed sizing is untouched. */
export class DynamicHeightController {
 private candidate?:number;private since=0;private growing=false;
 private stable?:{key:string;at:number};
 nextCheckAt=Infinity;
 get awaitingGrowth():boolean{return this.growing;}
 constructor(private readonly dependencies:HostDependencies={}){}
 async fit(d:LaunchDescriptor,config:Config,contentRows:number,now=Date.now(),geometry?:{columns:number;rows:number},current=()=>true,signal?:AbortSignal):Promise<number|undefined> {
  this.growing=false;
  this.nextCheckAt=Infinity;
  if(!get(config,'terminal.dynamicHeight')||!d.host||d.demo){this.candidate=undefined;this.stable=undefined;return;}
  if(!Number.isInteger(contentRows)||contentRows<1)throw new Error('Invalid rendered content height');
  const host=d.host,viewer=host.hudProcess,pid=this.dependencies.pid??process.pid;
  if(!viewer||viewer.pid!==pid||d.pid!==pid||!host.hudPane)throw new Error('Current viewer identity cannot resize this display');
  const registered=()=>{
   const record=readHost(host.recordFile);
   if(record.state!=='running'||!record.launchFile||!samePath(record.launchFile,d.file)||record.id!==host.proof.origin.originId)throw new Error('Host display registration has changed');
  };
  registered();
  const key=JSON.stringify([d.file,host.proof,viewer,host.hudPane,contentRows,get(config,'terminal.paneSize'),get(config,'terminal.refreshMs'),geometry]);
  if(this.candidate===undefined&&this.stable?.key===key&&now>=this.stable.at&&now-this.stable.at<5000){this.nextCheckAt=this.stable.at+5000;return;}
  this.stable=undefined;
  const client=new PsmuxClient(host.proof.origin,this.dependencies),panes=(await client.panesAsync(signal)).filter(p=>p.window===host.proof.window);
  if(!current())return;
  const owner=panes.find(p=>p.pane===host.proof.origin.pane),hud=panes.find(p=>p.pane===host.hudPane);
  if(panes.length!==2||!owner||!hud||owner.pid!==host.proof.owner.pid||hud.pid!==pid||owner.pane===hud.pane)throw new Error('Source/HUD panes no longer form the registered scope');
  const total=owner.height+hud.height,cap=Math.min(total-10,Math.floor(total*get(config,'terminal.paneSize')));
  if(cap<1){this.candidate=undefined;this.nextCheckAt=now+5000;return;}
  const target=Math.max(1,Math.min(contentRows,cap));
  if(target===hud.height){this.candidate=undefined;this.stable={key,at:now};this.nextCheckAt=now+5000;return;}
  this.growing=target>hud.height;
  if(target!==this.candidate){this.candidate=target;this.since=now;}
  const debounce=target<hud.height?2000:50;this.nextCheckAt=this.since+debounce;
  if(now<this.nextCheckAt)return;
  const ids=hostProcessIds(host.proof,[viewer.pid]),values=await(this.dependencies.processesAsync?this.dependencies.processesAsync(ids,pid):this.dependencies.processes?this.dependencies.processes(ids,pid):readProcessIdentitiesAsync(ids,signal)),actual=values.find(p=>p.pid===pid);
  if(!current())return;
  if(!actual||actual.startedAt!==viewer.startedAt||actual.parentPid!==viewer.parentPid||actual.name!==viewer.name)throw new Error('HUD viewer process incarnation changed');
  const physical=await client.paneAsync(host.proof.origin.pane,signal);if(!current())return;
  verifyHost(host.proof,'viewer',{...this.dependencies,processes:()=>values},physical);
  registered();if(!current())return;await client.resizePaneAsync(hud.pane,target,signal);
  const resized=await client.paneAsync(hud.pane,signal);
  if(resized.pid!==pid||resized.window!==owner.window)throw new Error('Resized HUD viewer identity changed');
  this.candidate=undefined;this.growing=false;this.nextCheckAt=now+5000;return resized.height;
 }
}
