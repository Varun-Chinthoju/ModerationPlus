import { client } from './client';

const rulesCache = new Map<string, string>();

export async function fetchRules(guildId: string, channelId: string): Promise<string> {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            const rulesMessage = messages.first();
            if (rulesMessage) {
                rulesCache.set(guildId, rulesMessage.content);
                console.log(`[Rules] Cached rules for guild ${guildId}`);
                return rulesMessage.content;
            }
        }
        return rulesCache.get(guildId) || "No rules loaded yet.";
    } catch (error) {
        console.error(`Error fetching rules for ${guildId}:`, error);
        return rulesCache.get(guildId) || "No rules loaded yet.";
    }
}

export function getCachedRules(guildId: string): string {
    return rulesCache.get(guildId) || "No rules loaded yet.";
}
