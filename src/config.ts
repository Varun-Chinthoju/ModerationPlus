import fs from 'fs';
import path from 'path';

export interface GuildConfig {
    guildId: string;
    rulesChannelId?: string;
    modLogsChannelId?: string;
    triggerBotId?: string;
    dashboardKey?: string;
    auditInterval?: number;
    defaultTimeout?: number; // ADDED: Default duration for manual/auto timeouts (in minutes)
}

const CONFIG_PATH = path.join(__dirname, '../guild-configs.json');

export function getAllConfigs(): Record<string, GuildConfig> {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
        return {};
    }
}

export function getConfig(guildId: string): GuildConfig | undefined {
    const configs = getAllConfigs();
    return configs[guildId];
}

export function saveConfig(config: Partial<GuildConfig> & { guildId: string }) {
    const configs = getAllConfigs();
    configs[config.guildId] = {
        ...(configs[config.guildId] || {}),
        ...config
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2));
}
