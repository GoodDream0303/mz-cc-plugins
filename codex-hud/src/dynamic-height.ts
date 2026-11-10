import {get,type Config} from './config.js';
import {readHost} from './host-session.js';
import {PsmuxClient,readProcessIdentities,samePath,verifyHost,hostProcessIds,type HostDependencies} from './psmux.js';
import type {LaunchDescriptor} from './runtime.js';

/** Resize only this viewer's registered two-pane stack; fixed sizing is untouched. */
export class DynamicHeightController {
 private candidate?:number;private since=0;private growing=false;
 private stable?:{key:string;at:number};
 get awaitingGrowth():boolean{return this.growing;}
 constructor(private readonly dependencies:HostDependencies={}){}
 fit(d:LaunchDescriptor,config:Config,contentRows:number,now=Date.now(),geometry?:{columns:number;rows:number}):number|undefined {
  this.growing=false;
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
  if(this.candidate===undefined&&this.stable?.key===key&&now>=this.stable.at&&now-this.stable.at<5000)return;
  this.stable=undefined;
  const client=new PsmuxClient(host.proof.origin,this.dependencies),panes=client.panes().filter(p=>p.window===host.proof.window);
  const owner=panes.find(p=>p.pane===host.proof.origin.pane),hud=panes.find(p=>p.pane===host.hudPane);
  if(panes.length!==2||!owner||!hud||owner.pid!==host.proof.owner.pid||hud.pid!==pid||owner.pane===hud.pane)throw new Error('Source/HUD panes no longer form the registered scope');
  const total=owner.height+hud.height,cap=Math.min(total-10,Math.floor(total*get(config,'terminal.paneSize')));
  if(cap<1){this.candidate=undefined;return;}
  const target=Math.max(1,Math.min(contentRows,cap));
  if(target===hud.height){this.candidate=undefined;this.stable={key,at:now};return;}
  this.growing=target>hud.height;
  if(target!==this.candidate){this.candidate=target;this.since=now;return;}
  const refresh=get(config,'terminal.refreshMs'),debounce=target<hud.height?Math.max(2000,refresh):refresh;
  if(now-this.since<debounce)return;
  const values=(this.dependencies.processes??readProcessIdentities)(hostProcessIds(host.proof,[viewer.pid]),pid),actual=values.find(p=>p.pid===pid);
  if(!actual||actual.startedAt!==viewer.startedAt||actual.parentPid!==viewer.parentPid||actual.name!==viewer.name)throw new Error('HUD viewer process incarnation changed');
  verifyHost(host.proof,'viewer',{...this.dependencies,processes:()=>values});
  registered();client.resizePane(hud.pane,target);
  const resized=client.pane(hud.pane);
  if(resized.pid!==pid||resized.window!==owner.window)throw new Error('Resized HUD viewer identity changed');
  this.candidate=undefined;this.growing=false;return resized.height;
 }
}
