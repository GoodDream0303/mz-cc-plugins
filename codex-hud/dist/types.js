export function emptySnapshot(sessionId) { return { sessionId, quotas: [], tools: [], agents: [], todos: [], compactions: 0, errors: [], status: 'unknown' }; }
