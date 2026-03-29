import * as fs from 'fs';
import * as path from 'path';

export interface GuildConfig {
    guildId: string;
    rulesChannelId?: string;
    modLogsChannelId?: string;
    triggerBotId?: string;
    dashboardKey?: string;
}

const CONFIG_PATH = path.join(__dirname, '../guild-configs.json');

// In-memory cache
let configs: Record<string, GuildConfig> = {};

// Load on startup
if (fs.existsSync(CONFIG_PATH)) {
    try {
        configs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
        console.error("Failed to load guild configs:", e);
    }
}

export function saveConfig(config: GuildConfig) {
    configs[config.guildId] = { ...configs[config.guildId], ...config };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2));
}

export function getConfig(guildId: string): GuildConfig | undefined {
    return configs[guildId];
}

export function getAllConfigs(): Record<string, GuildConfig> {
    return configs;
}
