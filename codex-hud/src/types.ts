export interface Tokens {input:number;cached:number;output:number;reasoning:number;total:number}
export interface Quota {id:string;minutes:number;usedPercent:number;resetsAt?:number}
export interface Tool {id:string;name:string;status:'running'|'done'|'failed'|'cancelled'}
export interface Agent {id:string;name:string;status:string;model?:string}
export interface Todo {step:string;status:string}
export interface HudSnapshot {
 sessionId:string;parentId?:string;activityAt?:string;cwd?:string;startedAt?:string;model?:string;effort?:string;version?:string;provider?:string;plan?:string;
 context?:{used:number;window:number};totals?:Tokens;latest?:Tokens;quotas:Quota[];
 tools:Tool[];agents:Agent[];todos:Todo[];mcpUsed:string[];compactions:number;lastResponseAt?:string;
 errors:string[];status:string;sessionName?:string;
 environment?:EnvironmentFacts;
}
export interface EnvironmentFacts {
 git?:{branch:string;dirty:boolean;ahead:number;behind:number;modified:number;added:number;untracked:number};
 mcp:{name:string;enabled:boolean}[];errors:string[];
}
export interface SessionInfo {id:string;cwd:string;path:string;startedAt?:string;parentId?:string;modified:number}
export function emptySnapshot(sessionId:string):HudSnapshot{return {sessionId,quotas:[],tools:[],agents:[],todos:[],mcpUsed:[],compactions:0,errors:[],status:'unknown'};}
