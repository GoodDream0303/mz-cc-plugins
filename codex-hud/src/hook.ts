import {bindLaunch} from './runtime.js';
export async function handleHook():Promise<void>{
 const launch=process.env.MZ_CODEX_HUD_LAUNCH;if(!launch)return;
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024*1024)throw new Error('Hook input too large');}
 const event=JSON.parse(input);
 if(event.hook_event_name&&event.hook_event_name!=='SessionStart')return;
 bindLaunch(launch,event);
}

