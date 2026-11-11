import { sanitize } from './terminal-text.js';
import { commandDetails, scriptDetails } from './command-details.js';
export { commandDetails } from './command-details.js';
export function toolCategory(name) {
    if (['exec_command', 'functions.exec_command'].includes(name))
        return 'command';
    if (['exec', 'functions.exec'].includes(name))
        return 'script';
}
const agentOperations = new Map([['spawn_agent', 'agentSpawn'], ['followup_task', 'agentFollowup'], ['send_message', 'agentMessage'], ['interrupt_agent', 'agentInterrupt'], ['resume_agent', 'agentResume'], ['close_agent', 'agentClose'], ['wait_agent', 'agentWait']]);
export function isAgentAction(action) { return !!action && action.kind.startsWith('agent'); }
function basename(value) {
    if (typeof value !== 'string')
        return;
    const name = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
    if (!/^[\p{L}\p{N}_.() -]{1,64}$/u.test(name) || /^(?:ghp_|github_pat_|sk-)/i.test(name))
        return;
    return name;
}
export function toolDetails(name, args) {
    const operation = agentOperations.get(name.replace(/^collaboration\./, ''));
    if (operation) {
        const value = operation === 'agentSpawn' ? args?.task_name ?? args?.agent_type : args?.target ?? args?.agent_id ?? args?.id;
        const target = typeof value === 'string' ? sanitize(value).slice(0, 200) : '';
        return { action: { kind: operation, ...(target ? { target } : {}) } };
    }
    if (['exec_command', 'functions.exec_command'].includes(name)) {
        const action = commandDetails(args?.cmd);
        return action ? { action } : {};
    }
    if (['exec', 'functions.exec'].includes(name)) {
        const action = scriptDetails(typeof args === 'string' ? args : args?.input);
        return action ? { action } : {};
    }
    if (['apply_patch', 'functions.apply_patch'].includes(name)) {
        const matches = typeof args === 'string' && args.length <= 8192 ? [...args.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)] : [];
        const target = matches.length === 1 ? basename(matches[0][1]) : undefined;
        return { action: { kind: 'patch', ...(target ? { target } : {}) } };
    }
    return {};
}
