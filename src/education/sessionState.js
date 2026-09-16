export function dailySessionComplete(session){return Boolean(session?.completedAt&&session?.responses&&Array.isArray(session.responses))}
