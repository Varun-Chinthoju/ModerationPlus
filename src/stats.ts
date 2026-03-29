import { MassScanResult } from './ai';

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
    massScans: MassScanResult[];
    pulseCounter: number; // ADDED: Tracks messages until next auto-audit
}

const statsMap = new Map<string, GuildStats>();
let accessLogs: AccessLog[] = [];
let startTime = Date.now();

export function getGuildStats(guildId: string): GuildStats {
    if (!statsMap.has(guildId)) {
        statsMap.set(guildId, {
            totalEvaluations: 0,
            totalViolations: 0,
            totalTimeouts: 0,
            lastActions: [],
            massScans: [],
            pulseCounter: 0
        });
    }
    return statsMap.get(guildId)!;
}

export function incrementPulse(guildId: string): number {
    const stats = getGuildStats(guildId);
    stats.pulseCounter++;
    return stats.pulseCounter;
}

export function resetPulse(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.pulseCounter = 0;
}

export function recordAction(guildId: string, action: ModerationAction) {
    const stats = getGuildStats(guildId);
    stats.totalEvaluations++;
    if (action.violation) stats.totalViolations++;
    
    stats.lastActions.unshift(action);
    if (stats.lastActions.length > 50) stats.lastActions.pop();
}

export function recordMassScan(guildId: string, report: MassScanResult) {
    const stats = getGuildStats(guildId);
    stats.massScans.unshift(report);
    if (stats.massScans.length > 20) stats.massScans.pop();
}

export function recordTimeout(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.totalTimeouts++;
}

export function recordAccess(log: AccessLog) {
    accessLogs.unshift(log);
    if (accessLogs.length > 20) accessLogs.pop();
}

export function clearLogs(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.lastActions = [];
    stats.massScans = [];
}

export function clearAccessLogs() {
    accessLogs = [];
}

export function getGlobalStats() {
    return {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        accessLogs
    };
}
