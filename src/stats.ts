import fs from 'fs';
import path from 'path';
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

export interface DashboardAuditLog {
    timestamp: string;
    user: string;
    action: string;
    target?: string;
}

export interface GuildStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    lastActions: ModerationAction[];
    massScans: MassScanResult[];
    pulseCounter: number;
    dashboardAuditLogs: DashboardAuditLog[]; // ADDED: Accountability for dashboard users
}

const STATS_PATH = path.join(__dirname, '../stats.json');
let statsMap: Record<string, GuildStats> = {};
let accessLogs: AccessLog[] = [];
let startTime = Date.now();

function loadStats() {
    if (fs.existsSync(STATS_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'));
            statsMap = data.guilds || {};
            accessLogs = data.accessLogs || [];
        } catch (e) {
            console.error('[Stats] Failed to load persistent history.');
            statsMap = {};
        }
    }
}

function saveStats() {
    try {
        const data = {
            guilds: statsMap,
            accessLogs
        };
        fs.writeFileSync(STATS_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[Stats] Failed to save history to disk.');
    }
}

loadStats();

export function getGuildStats(guildId: string): GuildStats {
    if (!statsMap[guildId]) {
        statsMap[guildId] = {
            totalEvaluations: 0,
            totalViolations: 0,
            totalTimeouts: 0,
            lastActions: [],
            massScans: [],
            pulseCounter: 0,
            dashboardAuditLogs: []
        };
    }
    // Ensure new fields exist for old data
    if (!statsMap[guildId].dashboardAuditLogs) statsMap[guildId].dashboardAuditLogs = [];
    return statsMap[guildId];
}

export function incrementPulse(guildId: string): number {
    const stats = getGuildStats(guildId);
    stats.pulseCounter++;
    saveStats();
    return stats.pulseCounter;
}

export function resetPulse(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.pulseCounter = 0;
    saveStats();
}

export function recordAction(guildId: string, action: ModerationAction) {
    const stats = getGuildStats(guildId);
    stats.totalEvaluations++;
    if (action.violation) stats.totalViolations++;
    
    stats.lastActions.unshift(action);
    if (stats.lastActions.length > 100) stats.lastActions.pop();
    saveStats();
}

export function recordMassScan(guildId: string, report: MassScanResult) {
    const stats = getGuildStats(guildId);
    stats.massScans.unshift(report);
    if (stats.massScans.length > 50) stats.massScans.pop();
    saveStats();
}

export function recordDashboardAction(guildId: string, log: DashboardAuditLog) {
    const stats = getGuildStats(guildId);
    stats.dashboardAuditLogs.unshift(log);
    if (stats.dashboardAuditLogs.length > 50) stats.dashboardAuditLogs.pop();
    saveStats();
}

export function recordTimeout(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.totalTimeouts++;
    saveStats();
}

export function recordAccess(log: AccessLog) {
    accessLogs.unshift(log);
    if (accessLogs.length > 50) accessLogs.pop();
    saveStats();
}

export function clearLogs(guildId: string) {
    const stats = getGuildStats(guildId);
    stats.lastActions = [];
    stats.massScans = [];
    stats.dashboardAuditLogs = [];
    saveStats();
}

export function clearAccessLogs() {
    accessLogs = [];
    saveStats();
}

export function getCommunityVibe(guildId: string) {
    const stats = getGuildStats(guildId);
    if (stats.massScans.length === 0) return { status: 'Stable', score: 100, label: 'No recent audits' };

    // Simple heuristic: count critical/high risk users in last 3 scans
    const recentScans = stats.massScans.slice(0, 3);
    let totalUsers = 0;
    let riskPoints = 0;

    recentScans.forEach(scan => {
        scan.usersAnalyzed.forEach(user => {
            totalUsers++;
            if (user.riskLevel === 'Critical') riskPoints += 10;
            if (user.riskLevel === 'High') riskPoints += 5;
            if (user.riskLevel === 'Medium') riskPoints += 2;
        });
    });

    if (totalUsers === 0) return { status: 'Stable', score: 100, label: 'Atmosphere Calm' };

    const averageRisk = riskPoints / recentScans.length;
    
    if (averageRisk > 15) return { status: 'Chaotic', score: 20, label: 'Critical Risk Detected' };
    if (averageRisk > 8) return { status: 'Tense', score: 50, label: 'Elevated Tensions' };
    if (averageRisk > 3) return { status: 'Unstable', score: 75, label: 'Minor Conflicts' };
    
    return { status: 'Stable', score: 95, label: 'Optimal Environment' };
}

export function getGlobalStats() {
    return {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        accessLogs
    };
}
