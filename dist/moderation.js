"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePotentialInfraction = handlePotentialInfraction;
const discord_js_1 = require("discord.js");
const ai_1 = require("./ai");
const index_1 = require("./index");
const stats_1 = require("./stats");
async function handlePotentialInfraction(channel, targetUser, triggerMessage) {
    console.log(`Analyzing potential infraction by ${targetUser.tag} in #${channel.name}`);
    // Gather context
    const messages = await channel.messages.fetch({ limit: 50, before: triggerMessage.id });
    // Sort oldest to newest
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    // Format transcript
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    // Analyze
    const analysis = await (0, ai_1.analyzeContext)(transcript, targetUser.tag);
    if (!analysis) {
        console.error("Analysis failed.");
        return;
    }
    // Record the action for the dashboard
    (0, stats_1.recordAction)({
        timestamp: new Date().toISOString(),
        targetUser: targetUser.tag,
        channel: channel.name,
        violation: analysis.violation,
        reason: analysis.shortReason,
        analysis: analysis.detailedAnalysis
    });
    if (!analysis.violation) {
        console.log(`No violation detected for ${targetUser.tag} after AI review.`);
        return;
    }
    // Send to mod logs
    const modLogsChannelId = process.env.MOD_LOGS_CHANNEL_ID;
    if (!modLogsChannelId)
        return;
    const modLogsChannel = await index_1.client.channels.fetch(modLogsChannelId);
    if (!modLogsChannel || !modLogsChannel.isTextBased())
        return;
    const textChannel = modLogsChannel;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`Potential Rule Violation: ${targetUser.tag}`)
        .setColor(0xff0000)
        .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true }, { name: 'Suggested Timeout', value: `${analysis.timeoutMinutes} minutes`, inline: true }, { name: 'Short Reason', value: analysis.shortReason }, { name: 'Detailed Analysis', value: analysis.detailedAnalysis })
        .setTimestamp();
    const approveBtn = new discord_js_1.ButtonBuilder()
        .setCustomId(`approve_timeout_${targetUser.id}_${analysis.timeoutMinutes}`)
        .setLabel(`Approve Timeout (${analysis.timeoutMinutes}m)`)
        .setStyle(discord_js_1.ButtonStyle.Danger);
    const dismissBtn = new discord_js_1.ButtonBuilder()
        .setCustomId(`dismiss_warning_${targetUser.id}`)
        .setLabel('Dismiss')
        .setStyle(discord_js_1.ButtonStyle.Secondary);
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(approveBtn, dismissBtn);
    await textChannel.send({ embeds: [embed], components: [row] });
}
