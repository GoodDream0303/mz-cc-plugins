import { get } from './config.js';
/** Clock-only rendering must not trigger telemetry reads or process queries. */
export function nextDisplayAt(s, c, now) {
    let next = Infinity;
    const cadence = get(c, 'terminal.refreshMs');
    const at = (value) => { if (Number.isFinite(value) && value > now)
        next = Math.min(next, value); };
    if (get(c, 'display.showTools'))
        for (const tool of s.tools) {
            if (tool.status === 'running') {
                if (Number.isFinite(tool.startedAt))
                    at(now + cadence);
            }
            else if (Number.isFinite(tool.finishedAt)) {
                at(tool.finishedAt);
                at(tool.finishedAt + 60001);
            }
        }
    if (get(c, 'display.showAgents'))
        for (const agent of s.agents) {
            if (['starting', 'running'].includes(agent.status)) {
                if (Number.isFinite(agent.startedAt))
                    at(now + cadence);
            }
            else if (Number.isFinite(agent.endedAt)) {
                at(agent.endedAt);
                at(agent.endedAt + 60001);
            }
        }
    if (get(c, 'display.showDuration') && s.startedAt) {
        const start = Date.parse(s.startedAt);
        if (Number.isFinite(start))
            at(start + (Math.floor((now - start) / 60000) + 1) * 60000);
    }
    if (get(c, 'display.timeFormat') !== 'absolute')
        for (const [visible, value] of [[get(c, 'display.showSessionStartDate'), s.startedAt], [get(c, 'display.showLastResponseAt'), s.lastResponseAt]]) {
            if (visible && value) {
                const time = Date.parse(value);
                if (Number.isFinite(time))
                    at(time + (Math.floor((now - time - 1) / 60000 + 0.5) + 0.5) * 60000 + 1);
            }
        }
    if (get(c, 'display.showUsage'))
        for (const quota of s.quotas) {
            if (quota.minutes === 300 && !get(c, 'display.showFiveHourUsage') || quota.minutes === 10080 && !get(c, 'display.showSevenDayUsage') || quota.usedPercent < get(c, quota.minutes >= 10080 ? 'display.sevenDayThreshold' : 'display.usageThreshold'))
                continue;
            if (!quota.resetsAt)
                continue;
            const reset = quota.resetsAt * 1000;
            at(reset);
            if (reset > now && get(c, 'display.timeFormat') !== 'absolute')
                at(reset + (Math.floor((now - reset - 1) / 60000 + 0.5) + 0.5) * 60000 + 1);
        }
    return next;
}
