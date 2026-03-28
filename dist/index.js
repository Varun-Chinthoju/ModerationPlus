"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("./client");
const rules_1 = require("./rules");
const moderation_1 = require("./moderation");
const register_1 = require("./register");
const stats_1 = require("./stats");
// Initialize Express for Dashboard API
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/stats', (req, res) => {
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const isAuthorized = key === process.env.DASHBOARD_KEY;
    // Record the access attempt
    (0, stats_1.recordAccess)({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: isAuthorized
    });
    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json((0, stats_1.getStats)());
});
app.get('/api/channels', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (key !== process.env.DASHBOARD_KEY) {
        console.log(`[API] Unauthorized channel fetch attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // Fetch the guild to ensure it's in cache or get it fresh
        const guilds = await client_1.client.guilds.fetch();
        const firstGuildBase = guilds.first();
        if (!firstGuildBase) {
            console.error("[API] Bot is not in any guilds.");
            return res.status(404).json({ error: 'Bot is not in any guilds' });
        }
        const guild = await firstGuildBase.fetch();
        const fetchedChannels = await guild.channels.fetch();
        const channels = fetchedChannels
            .filter(c => c !== null && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }));
        console.log(`[API] Fetched ${channels.length} channels for dashboard.`);
        res.json(channels);
    }
    catch (error) {
        console.error('[API] Failed to fetch channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});
app.post('/api/mass-scan', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (key !== process.env.DASHBOARD_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { channelId } = req.body;
    if (!channelId)
        return res.status(400).json({ error: 'channelId is required' });
    try {
        const channel = await client_1.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Channel not found or not text-based' });
        }
        const report = await (0, moderation_1.performMassScan)(channel);
        if (!report)
            return res.status(500).json({ error: 'Scan failed' });
        res.json(report);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred during mass scan' });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));
client_1.client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    await (0, register_1.registerCommands)(readyClient.user.id);
    // Fetch rules on startup
    if (process.env.RULES_CHANNEL_ID) {
        await (0, rules_1.fetchRules)(process.env.RULES_CHANNEL_ID);
    }
});
client_1.client.on(discord_js_1.Events.MessageCreate, async (message) => {
    // Ignore direct messages
    if (!message.guild || !message.channel.isTextBased())
        return;
    // Check if the message is from the trigger bot (e.g., Arcane)
    if (process.env.TRIGGER_BOT_ID && message.author.id === process.env.TRIGGER_BOT_ID) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
            await (0, moderation_1.handlePotentialInfraction)(message.channel, targetUser, message);
        }
    }
});
client_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'refresh-rules') {
                if (!interaction.memberPermissions?.has('Administrator')) {
                    await interaction.reply({ content: 'You do not have permission to use this.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                    return;
                }
                if (process.env.RULES_CHANNEL_ID) {
                    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
                    await (0, rules_1.fetchRules)(process.env.RULES_CHANNEL_ID);
                    await interaction.editReply('Rules successfully refreshed!');
                }
                else {
                    await interaction.reply({ content: 'RULES_CHANNEL_ID not set.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
            }
        }
        if (interaction.isMessageContextMenuCommand()) {
            if (interaction.commandName === 'Analyze Context') {
                if (!interaction.memberPermissions?.has('ManageMessages')) {
                    await interaction.reply({ content: 'You do not have permission to use this.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                    return;
                }
                await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
                const message = interaction.targetMessage;
                if (message.channel.isTextBased()) {
                    await (0, moderation_1.handlePotentialInfraction)(message.channel, message.author, message);
                    await interaction.editReply('Analysis requested. Check the mod logs channel for results.');
                }
                else {
                    await interaction.editReply('Could not analyze this channel.');
                }
            }
        }
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('dismiss_warning_')) {
                await interaction.update({ content: 'Warning dismissed by ' + interaction.user.tag, components: [] });
                return;
            }
            if (interaction.customId.startsWith('approve_timeout_')) {
                const parts = interaction.customId.split('_');
                const targetUserId = parts[2];
                const timeoutMinutesStr = parts[3];
                if (!interaction.guild || !targetUserId || !timeoutMinutesStr)
                    return;
                const timeoutMinutes = parseInt(timeoutMinutesStr, 10);
                try {
                    const member = await interaction.guild.members.fetch(targetUserId);
                    if (member) {
                        await member.timeout(timeoutMinutes * 60 * 1000, `AI Moderation approved by ${interaction.user.tag}`);
                        (0, stats_1.recordTimeout)();
                        await interaction.update({ content: `Timeout of ${timeoutMinutes}m applied to <@${targetUserId}> by ${interaction.user.tag}.`, components: [] });
                    }
                    else {
                        await interaction.update({ content: `User not found in server.`, components: [] });
                    }
                }
                catch (err) {
                    console.error(err);
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: 'Failed to apply timeout. Check my permissions.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                    }
                    else {
                        await interaction.reply({ content: 'Failed to apply timeout. Check my permissions.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                    }
                }
            }
        }
    }
    catch (error) {
        console.error('Interaction Error:', error);
    }
});
// Basic error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
client_1.client.login(process.env.DISCORD_TOKEN);
