export interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    startTime: number;
    lastActions: ModerationAction[];
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
    totalTimeouts: Date.now(),
    startTime: Date.now(),
    lastActions: []
};

export function recordAction(action: ModerationAction) {
    stats.totalEvaluations++;
    if (action.violation) stats.totalViolations++;
    stats.lastActions.unshift(action);
    if (stats.lastActions.length > 50) stats.lastActions.pop();
}

export function recordTimeout() {
    stats.totalTimeouts++;
}

export function getStats(): BotStats & { uptime: number } {
    return { ...stats, uptime: Math.floor((Date.now() - stats.startTime) / 1000) };
}
