export interface ModerationAction {
    timestamp: string;
    targetUser: string;
    targetRoles: string[];
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
    socialProfile?: string;
    type: 'INFRACTION' | 'AUDIT' | 'NORMAL';
    auditData?: MassScanReport;
}

export interface MassScanReport {
    timestamp: string;
    channel: string;
    totalMessages: number;
    generalConclusion: string;
    usersAnalyzed: any[];
}

export interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

export interface GuildStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    lastActions: ModerationAction[];
    massScans: MassScanReport[];
}

export interface BotStats {
    startTime: number;
    accessLogs: AccessLog[];
    guilds: Record<string, GuildStats>;
}

const stats: BotStats = {
    startTime: Date.now(),
    accessLogs: [],
    guilds: {}
};

function getOrCreateGuildStats(guildId: string): GuildStats {
    if (!stats.guilds[guildId]) {
        stats.guilds[guildId] = {
            totalEvaluations: 0,
            totalViolations: 0,
            totalTimeouts: 0,
            lastActions: [],
            massScans: []
        };
    }
    return stats.guilds[guildId];
}

export function recordAction(guildId: string, action: ModerationAction) {
    const g = getOrCreateGuildStats(guildId);
    g.totalEvaluations++;
    if (action.violation) g.totalViolations++;
    g.lastActions.unshift(action);
    if (g.lastActions.length > 100) g.lastActions.pop();
}

export function recordMassScan(guildId: string, report: MassScanReport) {
    const g = getOrCreateGuildStats(guildId);
    g.massScans.unshift(report);
    if (g.massScans.length > 20) g.massScans.pop();
}

export function recordAccess(log: AccessLog) {
    stats.accessLogs.unshift(log);
    if (stats.accessLogs.length > 20) stats.accessLogs.pop();
}

export function recordTimeout(guildId: string) {
    const g = getOrCreateGuildStats(guildId);
    g.totalTimeouts++;
}

export function clearLogs(guildId: string) {
    if (stats.guilds[guildId]) {
        stats.guilds[guildId].lastActions = [];
        stats.guilds[guildId].massScans = [];
    }
}

export function clearAccessLogs() {
    stats.accessLogs = [];
}

export function getGuildStats(guildId: string) {
    return getOrCreateGuildStats(guildId);
}

export function getGlobalStats() {
    return {
        startTime: stats.startTime,
        accessLogs: stats.accessLogs,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    };
}
