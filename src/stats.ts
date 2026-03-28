export interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    startTime: number;
    lastActions: ModerationAction[];
    accessLogs: AccessLog[];
}

export interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

export interface ModerationAction {
    timestamp: string;
    targetUser: string;
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
}

const stats: BotStats = {
    totalEvaluations: 0,
    totalViolations: 0,
    totalTimeouts: 0,
    startTime: Date.now(),
    lastActions: [],
    accessLogs: []
};

export function recordAction(action: ModerationAction) {
    stats.totalEvaluations++;
    if (action.violation) stats.totalViolations++;
    stats.lastActions.unshift(action);
    if (stats.lastActions.length > 50) stats.lastActions.pop();
}

export function recordAccess(log: AccessLog) {
    stats.accessLogs.unshift(log);
    if (stats.accessLogs.length > 20) stats.accessLogs.pop();
}

export function recordTimeout() {
    stats.totalTimeouts++;
}

export function getStats(): BotStats & { uptime: number } {
    return { ...stats, uptime: Math.floor((Date.now() - stats.startTime) / 1000) };
}
