"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePotentialInfraction = handlePotentialInfraction;
exports.performMassScan = performMassScan;
const discord_js_1 = require("discord.js");
const ai_1 = require("./ai");
const client_1 = require("./client");
const stats_1 = require("./stats");
const config_1 = require("./config");
async function handlePotentialInfraction(channel, targetUser, triggerMessage, isProactive = false, forceLog = false) {
    const config = (0, config_1.getConfig)(channel.guild.id);
    if (!config)
        return;
    // Vulcan Protection & Developer Identity
    const isVulcan = targetUser.tag === 'vulcan_999456' || targetUser.username === 'vulcan_999456';
    const testPhrases = ['testing bot', 'test bot', 'bot test', 'ignore this'];
    const content = triggerMessage.content.toLowerCase();
    if (isVulcan && !forceLog) {
        if (testPhrases.some(phrase => content.includes(phrase))) {
            console.log(`[Developer] Skipping analysis for Vulcan's test message.`);
            return;
        }
    }
    console.log(`${forceLog ? '[Manual]' : (isProactive ? '[Proactive]' : '[Triggered]')} Analyzing ${targetUser.tag} in #${channel.name}`);
    // Fetch member safely (Check cache first to avoid rate limits)
    let roles = [];
    try {
        let member = channel.guild.members.cache.get(targetUser.id);
        if (!member) {
            member = await channel.guild.members.fetch(targetUser.id);
        }
        roles = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
    }
    catch (e) {
        console.log(`[Access] Could not fetch roles for ${targetUser.tag}, using defaults.`);
    }
    // Gather context
    const messages = await channel.messages.fetch({ limit: 50, before: triggerMessage.id });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    // Analyze
    const analysis = await (0, ai_1.analyzeContext)(channel.guild.id, transcript, targetUser.tag, roles);
    if (!analysis) {
        console.error("Analysis failed.");
        return;
    }
    (0, stats_1.recordAction)(channel.guild.id, {
        timestamp: new Date().toISOString(),
        targetUser: targetUser.tag,
        targetRoles: roles,
        channel: channel.name,
        violation: analysis.violation,
        reason: analysis.shortReason,
        analysis: analysis.detailedAnalysis,
        socialProfile: analysis.socialProfile,
        type: analysis.violation ? 'INFRACTION' : 'NORMAL'
    });
    const shouldLogToDiscord = analysis.violation || forceLog;
    if (!shouldLogToDiscord)
        return;
    const modLogsChannelId = config.modLogsChannelId;
    if (!modLogsChannelId)
        return;
    try {
        const modLogsChannel = await client_1.client.channels.fetch(modLogsChannelId);
        if (!modLogsChannel || !modLogsChannel.isTextBased())
            return;
        const textChannel = modLogsChannel;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(analysis.violation ? `Potential Rule Violation: ${targetUser.tag}` : `Neural Safety Audit: ${targetUser.tag}`)
            .setColor(analysis.violation ? 0xff0000 : 0x00ff00)
            .addFields({ name: 'Status', value: analysis.violation ? '🔴 Risk Detected' : '🟢 Safety Verified', inline: true }, { name: 'Channel', value: `<#${channel.id}>`, inline: true }, { name: 'User Roles', value: roles.join(', ') || 'None', inline: true }, { name: 'Behavior Profile', value: analysis.socialProfile || 'Neutral profiling engaged.' }, { name: 'Short Reason', value: analysis.shortReason }, { name: 'Detailed Analysis', value: analysis.detailedAnalysis })
            .setTimestamp();
        if (analysis.violation) {
            embed.addFields({ name: 'Suggested Timeout', value: `${analysis.timeoutMinutes} minutes`, inline: true });
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`approve_timeout_${targetUser.id}_${analysis.timeoutMinutes}`).setLabel(`Approve Timeout (${analysis.timeoutMinutes}m)`).setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId(`dismiss_warning_${targetUser.id}`).setLabel('Dismiss').setStyle(discord_js_1.ButtonStyle.Secondary));
            await textChannel.send({ embeds: [embed], components: [row] });
        }
        else {
            await textChannel.send({ embeds: [embed] });
        }
    }
    catch (e) {
        console.error(`[Moderation] Failed to send to mod logs:`, e);
    }
}
const massScanCache = new Map();
async function performMassScan(channel) {
    const permissions = channel.permissionsFor(client_1.client.user);
    if (!permissions || !permissions.has(discord_js_1.PermissionsBitField.Flags.ViewChannel) || !permissions.has(discord_js_1.PermissionsBitField.Flags.ReadMessageHistory)) {
        throw new Error('Missing Access: Bot cannot see that channel.');
    }
    console.log(`Starting mass scan for channel: #${channel.name}`);
    let currentCache = massScanCache.get(channel.id);
    let allMessages = [];
    try {
        if (currentCache) {
            let newMessages = [];
            let afterId = currentCache.lastId;
            while (true) {
                const fetched = await channel.messages.fetch({ limit: 100, after: afterId });
                if (fetched.size === 0)
                    break;
                newMessages = newMessages.concat(Array.from(fetched.values()));
                afterId = fetched.first()?.id;
                if (newMessages.length >= 500)
                    break;
            }
            allMessages = [...newMessages, ...currentCache.messages].slice(0, 500);
        }
        else {
            let lastId;
            for (let i = 0; i < 5; i++) {
                const options = { limit: 100 };
                if (lastId)
                    options.before = lastId;
                const fetched = await channel.messages.fetch(options);
                if (fetched.size === 0)
                    break;
                allMessages = allMessages.concat(Array.from(fetched.values()));
                lastId = fetched.last()?.id;
            }
        }
    }
    catch (e) {
        if (e.code === 50001)
            throw new Error('Missing Access: Bot cannot read history in that channel.');
        throw e;
    }
    const sorted = [...allMessages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const uniqueAuthors = Array.from(new Set(sorted.map(m => m.author.id)));
    const rolesMap = {};
    // REST-BASED INDIVIDUAL FETCHING (Safe from Opcode 8 rate limits)
    for (const authorId of uniqueAuthors) {
        try {
            let member = channel.guild.members.cache.get(authorId);
            if (!member) {
                member = await channel.guild.members.fetch(authorId);
            }
            rolesMap[member.user.tag] = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
        }
        catch (e) {
            // Fallback to message metadata if member fetch fails
            const msg = sorted.find(m => m.author.id === authorId);
            if (msg && !rolesMap[msg.author.tag])
                rolesMap[msg.author.tag] = [];
        }
    }
    const rolesString = Object.entries(rolesMap).map(([tag, roles]) => `${tag}: [${roles.join(', ')}]`).join('\n');
    if (allMessages.length > 0) {
        const latestMsg = allMessages.reduce((prev, current) => (prev.createdTimestamp > current.createdTimestamp) ? prev : current);
        massScanCache.set(channel.id, { messages: allMessages, lastId: latestMsg.id });
    }
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    const result = await (0, ai_1.analyzeMassScan)(channel.guild.id, transcript, sorted.length, rolesString);
    if (result) {
        const fullReport = {
            timestamp: new Date().toISOString(),
            channel: channel.name,
            totalMessages: result.totalMessages,
            generalConclusion: result.generalConclusion,
            usersAnalyzed: result.usersAnalyzed
        };
        (0, stats_1.recordMassScan)(channel.guild.id, fullReport);
        return fullReport;
    }
    return null;
}
