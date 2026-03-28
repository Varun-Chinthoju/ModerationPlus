export interface ModerationAction {
    timestamp: string;
    targetUser: string;
    targetRoles: string[];
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
    socialProfile?: string; // Added profiling
    type: 'INFRACTION' | 'AUDIT' | 'NORMAL';
    auditData?: MassScanReport;
}

export interface MassScanReport {
    timestamp: string;
    channel: string;
    totalMessages: number;
    generalConclusion: string;
    usersAnalyzed: UserSummary[];
}

export interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

export interface UserSummary {
    userTag: string;
    userRoles: string[];
    behaviorSummary: string;
    violatedRules: string[];
    suggestedPunishment: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    startTime: number;
    lastActions: ModerationAction[];
    massScans: MassScanReport[];
    accessLogs: AccessLog[];
}

const stats: BotStats = {
    totalEvaluations: 0,
    totalViolations: 0,
    totalTimeouts: 0,
    startTime: Date.now(),
    lastActions: [],
    massScans: [],
    accessLogs: []
};

export function recordAction(action: ModerationAction) {
    stats.totalEvaluations++;
    if (action.violation) stats.totalViolations++;
    stats.lastActions.unshift(action);
    if (stats.lastActions.length > 100) stats.lastActions.pop(); // Increased history
}

export function recordMassScan(report: MassScanReport) {
    stats.massScans.unshift(report);
    if (stats.massScans.length > 20) stats.massScans.pop();
}

export function recordAccess(log: AccessLog) {
    stats.accessLogs.unshift(log);
    if (stats.accessLogs.length > 20) stats.accessLogs.pop();
}

export function recordTimeout() {
    stats.totalTimeouts++;
}

export function clearLogs() {
    stats.lastActions = [];
    stats.massScans = [];
}

export function clearAccessLogs() {
    stats.accessLogs = [];
}

export function getStats(): BotStats & { uptime: number } {
    return { ...stats, uptime: Math.floor((Date.now() - stats.startTime) / 1000) };
}
