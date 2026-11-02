export function emptySnapshot(sessionId) { return { sessionId, quotas: [], tools: [], agents: [], todos: [], mcpUsed: [], compactions: 0, errors: [], status: 'unknown' }; }
