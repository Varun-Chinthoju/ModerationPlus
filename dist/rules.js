"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cachedRules = void 0;
exports.fetchRules = fetchRules;
const client_1 = require("./client");
exports.cachedRules = "No rules loaded yet.";
async function fetchRules(channelId) {
    try {
        const channel = await client_1.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Rules channel ${channelId} not found or is not text-based.`);
            return exports.cachedRules;
        }
        const messages = await channel.messages.fetch({ limit: 100 });
        // Sort messages by creation time (oldest first)
        const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const ruleParts = [];
        for (const m of sortedMessages) {
            if (m.content) {
                ruleParts.push(m.content);
            }
            if (m.embeds.length > 0) {
                for (const embed of m.embeds) {
                    if (embed.title)
                        ruleParts.push(`**${embed.title}**`);
                    if (embed.description)
                        ruleParts.push(embed.description);
                    if (embed.fields) {
                        for (const field of embed.fields) {
                            ruleParts.push(`${field.name}\n${field.value}`);
                        }
                    }
                }
            }
        }
        if (ruleParts.length > 0) {
            exports.cachedRules = ruleParts.join('\n\n');
            console.log(`Successfully cached rules (${exports.cachedRules.length} characters).`);
        }
        else {
            console.log("No rules text found in the channel.");
        }
        return exports.cachedRules;
    }
    catch (error) {
        console.error('Error fetching rules:', error);
        return exports.cachedRules;
    }
}
