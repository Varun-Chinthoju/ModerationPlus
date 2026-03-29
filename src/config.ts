import fs from 'fs';
import path from 'path';

export interface AuthorizedUser {
    username: string;
    key: string;
    role: 'ADMIN' | 'MOD';
}

export interface GuildConfig {
    guildId: string;
    rulesChannelId?: string;
    modLogsChannelId?: string;
    triggerBotId?: string;
    authorizedUsers: AuthorizedUser[]; // UPDATED: Support for multiple identities
    auditInterval?: number;
    defaultTimeout?: number;
}

const CONFIG_PATH = path.join(__dirname, '../guild-configs.json');

export function getAllConfigs(): Record<string, GuildConfig> {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        // Migrate old single-key configs to new user array format if needed
        Object.keys(data).forEach(id => {
            if (!data[id].authorizedUsers) {
                data[id].authorizedUsers = data[id].dashboardKey ? [{
                    username: 'admin',
                    key: data[id].dashboardKey,
                    role: 'ADMIN'
                }] : [];
                delete data[id].dashboardKey;
            }
        });
        return data;
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
        ...(configs[config.guildId] || { authorizedUsers: [] }),
        ...config
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2));
}
