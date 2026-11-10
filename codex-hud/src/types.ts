export interface Tokens {input:number;cached:number;output:number;reasoning:number;total:number}
export interface Quota {id:string;minutes:number;usedPercent:number;resetsAt?:number}
export interface ToolAction {kind:'read'|'search'|'list'|'patch'|'nodeTest'|'npmTest'|'pythonTest'|'build'|'git'|'node'|'python'|'powershell'|'shell'|'agentSpawn'|'agentFollowup'|'agentMessage'|'agentInterrupt'|'agentResume'|'agentClose'|'agentWait';target?:string}
export interface Tool {id:string;name:string;status:'running'|'done'|'failed'|'cancelled';startedAt?:number;finishedAt?:number;durationMs?:number;action?:ToolAction}
export interface Agent {id:string;name:string;status:string;model?:string;startedAt?:number;endedAt?:number;action?:string;totalTokens?:number}
export interface Todo {step:string;status:string}
export interface HudSnapshot {
 sessionId:string;parentId?:string;activityAt?:string;turnStartedAt?:number;turnEndedAt?:number;cwd?:string;startedAt?:string;model?:string;effort?:string;version?:string;provider?:string;plan?:string;
 context?:{used:number;window:number};totals?:Tokens;latest?:Tokens;quotas:Quota[];
 tools:Tool[];agents:Agent[];todos:Todo[];compactions:number;lastResponseAt?:string;
 errors:string[];status:string;sessionName?:string;
 environment?:EnvironmentFacts;
}
export interface EnvironmentFacts {
 git?:{branch:string;dirty:boolean;ahead:number;behind:number;modified:number;added:number;untracked:number};
 errors:string[];
}
export interface SessionInfo {id:string;cwd:string;path:string;startedAt?:string;parentId?:string;modified:number}
export function emptySnapshot(sessionId:string):HudSnapshot{return {sessionId,quotas:[],tools:[],agents:[],todos:[],compactions:0,errors:[],status:'unknown'};}
