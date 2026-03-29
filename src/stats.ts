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

export interface GuildStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    lastActions: ModerationAction[];
    massScans: MassScanResult[];
    pulseCounter: number;
}

const STATS_PATH = path.join(__dirname, '../stats.json');
let statsMap: Record<string, GuildStats> = {};
let accessLogs: AccessLog[] = [];
let startTime = Date.now();

// Load existing stats from disk
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

// Save current state to disk
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

// Initialize
loadStats();

export function getGuildStats(guildId: string): GuildStats {
    if (!statsMap[guildId]) {
        statsMap[guildId] = {
            totalEvaluations: 0,
            totalViolations: 0,
            totalTimeouts: 0,
            lastActions: [],
            massScans: [],
            pulseCounter: 0
        };
    }
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
    if (stats.lastActions.length > 100) stats.lastActions.pop(); // Increased storage limit
    saveStats();
}

export function recordMassScan(guildId: string, report: MassScanResult) {
    const stats = getGuildStats(guildId);
    stats.massScans.unshift(report);
    if (stats.massScans.length > 50) stats.massScans.pop(); // Increased storage limit
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
    saveStats();
}

export function clearAccessLogs() {
    accessLogs = [];
    saveStats();
}

export function getGlobalStats() {
    return {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        accessLogs
    };
}
