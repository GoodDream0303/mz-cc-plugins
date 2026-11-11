import {SessionReader} from './reader.js';
import {listSessions} from './sessions.js';
import type {HudSnapshot,SessionInfo} from './types.js';

/** Parent activity is primary; verified child lifecycle fills missing notifications. */
export class AgentSessionTracker {
 private readers=new Map<string,SessionReader>();private nextDiscovery=0;private discoveryUnavailable=false;
 constructor(private readonly root:string){}
 async refresh(snapshot:HudSnapshot,parent:SessionReader):Promise<void> {
  for(const agent of snapshot.agents){const timing=parent.agentTiming(agent.id);if(Number.isFinite(timing.startedAt))agent.startedAt=timing.startedAt;if(Number.isFinite(timing.endedAt))agent.endedAt=timing.endedAt;}
  const active=snapshot.agents.filter(a=>/^[a-zA-Z0-9_-]{3,100}$/.test(a.id));
  const retained=new Set(snapshot.agents.map(a=>a.id));for(const id of this.readers.keys())if(!retained.has(id))this.readers.delete(id);
  if(!active.length){this.discoveryUnavailable=false;return;}
  if(active.some(a=>!this.readers.has(a.id))&&Date.now()>=this.nextDiscovery){
   this.nextDiscovery=Date.now()+5000;let sessions:SessionInfo[]=[];
   try{sessions=await listSessions(this.root);this.discoveryUnavailable=false;}catch{this.discoveryUnavailable=true;}
   for(const agent of active){
    if(this.readers.has(agent.id))continue;
    const matches=sessions.filter(s=>s.id===agent.id&&s.parentId===snapshot.sessionId);
    if(matches.length===1)this.readers.set(agent.id,new SessionReader(matches[0].path,agent.id));
   }
  }
  if(this.discoveryUnavailable)snapshot.errors.push('Agent lifecycle lookup unavailable; showing parent-reported status');
  for(const agent of active){
   const reader=this.readers.get(agent.id);if(!reader)continue;
   let child:HudSnapshot;try{child=await reader.read();}catch{continue;}
   if(child.sessionId!==agent.id||child.parentId!==snapshot.sessionId)continue;
   const pending=['starting','running','interrupted'].includes(agent.status),at=Date.parse(child.activityAt??'');
   const taskStart=parent.agentTiming(agent.id).startedAt??(pending?parent.agentActivityAt(agent.id):undefined)??-Infinity;
   if(!Number.isFinite(at)||at<taskStart)continue;
   const oldInterrupted=agent.status==='interrupted'&&at<(parent.agentActivityAt(agent.id)??-Infinity);
   if(child.model)agent.model=child.model;
   if(child.totals&&Number.isFinite(child.totals.total))agent.totalTokens=child.totals.total;
   if(Number.isFinite(child.turnStartedAt)&&(pending||!Number.isFinite(agent.endedAt)||child.turnStartedAt!<=agent.endedAt!)){
    agent.startedAt=child.turnStartedAt;
    if(!oldInterrupted){if(Number.isFinite(child.turnEndedAt))agent.endedAt=child.turnEndedAt;else if(pending)delete agent.endedAt;}
   }
   if(!pending||oldInterrupted){delete agent.action;continue;}
   const status=({working:'running',idle:'done',interrupted:'interrupted'} as Record<string,string>)[child.status];
   if(status){agent.status=status;if(status==='running')agent.action=child.todos.find(t=>t.status==='in_progress')?.step??child.tools.filter(t=>t.status==='running').at(-1)?.name;else delete agent.action;}
  }
 }
}
