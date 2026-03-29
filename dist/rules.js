"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRules = fetchRules;
exports.getCachedRules = getCachedRules;
const client_1 = require("./client");
const rulesCache = new Map();
async function fetchRules(guildId, channelId) {
    try {
        const channel = await client_1.client.channels.fetch(channelId);
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
    }
    catch (error) {
        console.error(`Error fetching rules for ${guildId}:`, error);
        return rulesCache.get(guildId) || "No rules loaded yet.";
    }
}
function getCachedRules(guildId) {
    return rulesCache.get(guildId) || "No rules loaded yet.";
}
