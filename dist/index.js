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
const config_1 = require("./config");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
function getAuthorizedGuild(username, key, requestedGuildId) {
    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    const isDev = process.env.DEV_KEY && key === process.env.DEV_KEY;
    if (isDev)
        return { guildId: requestedGuildId || Object.keys(configs)[0], role: 'DEV', isDev: true };
    const config = Object.values(configs).find((c) => c.authorizedUsers.some((u) => u.username === username && u.key === key));
    if (config) {
        const user = config.authorizedUsers.find((u) => u.username === username);
        return { guildId: config.guildId, role: user.role, isDev: false };
    }
    return null;
}
app.get('/api/stats', (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const requestedGuildId = req.query.guildId;
    const auth = getAuthorizedGuild(username, key, requestedGuildId);
    (0, stats_1.recordAccess)({ timestamp: new Date().toISOString(), ip: Array.isArray(ip) ? ip[0] : ip, success: !!auth });
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    const guildStats = (0, stats_1.getGuildStats)(auth.guildId);
    const globalStats = (0, stats_1.getGlobalStats)();
    const guildConfig = (0, config_1.getConfig)(auth.guildId);
    res.json({
        ...globalStats,
        ...guildStats,
        guildId: auth.guildId,
        isDev: auth.isDev,
        role: auth.role,
        defaultTimeout: guildConfig?.defaultTimeout || 10,
        authorizedUsers: auth.isDev || auth.role === 'ADMIN' ? guildConfig?.authorizedUsers : [],
        communityVibe: (0, stats_1.getCommunityVibe)(auth.guildId), // ADDED: Predictive Analytics
        cachedRules: (0, rules_1.getCachedRules)(auth.guildId) // ADDED: Policy Transparency
    });
});
app.get('/api/members', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.query.guildId);
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const guild = await client_1.client.guilds.fetch(auth.guildId);
        const members = await guild.members.fetch();
        const memberList = members.map(m => ({
            tag: m.user.tag, nickname: m.nickname, avatar: m.user.displayAvatarURL(),
            roles: m.roles.cache.map(r => r.name).filter(n => n !== '@everyone'),
            joinedAt: m.joinedAt?.toISOString(), status: m.presence?.status || 'offline'
        }));
        res.json(memberList);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});
app.post('/api/config/refresh-rules', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.body.guildId);
    if (!auth || auth.role === 'MOD')
        return res.status(403).json({ error: 'Forbidden' });
    const config = (0, config_1.getConfig)(auth.guildId);
    if (!config?.rulesChannelId)
        return res.status(400).json({ error: 'No rules channel configured' });
    try {
        await (0, rules_1.fetchRules)(auth.guildId, config.rulesChannelId);
        (0, stats_1.recordDashboardAction)(auth.guildId, { timestamp: new Date().toISOString(), user: username, action: 'Refreshed Sovereign Rules' });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Fetch failed' });
    }
});
app.post('/api/users/add', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.body.guildId);
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'DEV'))
        return res.status(403).json({ error: 'Forbidden' });
    const { newUsername, newKey, newRole, guildId } = req.body;
    const config = (0, config_1.getConfig)(guildId || auth.guildId);
    if (!config)
        return res.status(404).json({ error: 'Not found' });
    config.authorizedUsers.push({ username: newUsername, key: newKey, role: newRole || 'MOD' });
    (0, config_1.saveConfig)(config);
    (0, stats_1.recordDashboardAction)(config.guildId, { timestamp: new Date().toISOString(), user: username, action: 'Authorized New Identity', target: newUsername });
    res.json({ success: true });
});
app.get('/api/dev/guilds', (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY)
        return res.status(403).json({ error: 'Forbidden' });
    const guilds = client_1.client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.iconURL(), memberCount: g.memberCount }));
    res.json(guilds);
});
app.get('/api/channels', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.query.guildId);
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const guild = await client_1.client.guilds.fetch(auth.guildId);
        const fetchedChannels = await guild.channels.fetch();
        const sensitiveKeywords = ['mod', 'admin', 'staff', 'log', 'private', 'dev'];
        const channels = fetchedChannels
            .filter(c => c !== null && c.isTextBased() && !c.isThread())
            .filter(c => auth.isDev || !sensitiveKeywords.some(word => c.name.toLowerCase().includes(word)))
            .map(c => ({ id: c.id, name: c.name }));
        res.json(channels);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
app.post('/api/timeout', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const { guildId, userTag, minutes, reason } = req.body;
    const auth = getAuthorizedGuild(username, key, guildId);
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const guild = await client_1.client.guilds.fetch(auth.guildId);
        let member = guild.members.cache.find(m => m.user.tag === userTag || m.user.username === userTag);
        if (!member) {
            const results = await guild.members.search({ query: userTag, limit: 1 });
            member = results.first();
        }
        if (!member)
            return res.status(404).json({ error: 'Member not found' });
        const botMember = await guild.members.fetch(client_1.client.user.id);
        if (member.roles.highest.position >= botMember.roles.highest.position)
            return res.status(403).json({ error: 'Hierarchy Error' });
        await member.timeout(minutes * 60 * 1000, `Neural Enforcement by ${username}: ${reason || 'Manual'}`);
        (0, stats_1.recordTimeout)(auth.guildId);
        (0, stats_1.recordAction)(auth.guildId, { timestamp: new Date().toISOString(), targetUser: userTag, targetRoles: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone'), channel: 'DASHBOARD', violation: true, reason: `Manual Enforcement by ${username}`, analysis: `Enforced via Web Dashboard`, socialProfile: 'Enforced Identity', type: 'INFRACTION' });
        (0, stats_1.recordDashboardAction)(auth.guildId, { timestamp: new Date().toISOString(), user: username, action: `Enforced ${minutes}m Timeout`, target: userTag });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/mass-scan', async (req, res) => {
    const username = req.headers['x-username'], key = req.headers['x-api-key'];
    const { channelId } = req.body;
    const auth = getAuthorizedGuild(username, key);
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const channel = await client_1.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased())
            return res.status(404).json({ error: 'Not found' });
        const textChannel = channel;
        if (!auth.isDev && textChannel.guild.id !== auth.guildId)
            return res.status(403).json({ error: 'Forbidden' });
        const report = await (0, moderation_1.performMassScan)(textChannel);
        (0, stats_1.recordDashboardAction)(auth.guildId, { timestamp: new Date().toISOString(), user: username, action: 'Initiated Community Audit', target: `#${textChannel.name}` });
        res.json(report);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
async function setBotAvatar() {
    const fs = require('fs');
    const path = require('path');
    const avatarPath = path.join(__dirname, '../Profile Pic.png');
    if (fs.existsSync(avatarPath)) {
        try {
            await client_1.client.user.setAvatar(avatarPath);
        }
        catch (e) { }
    }
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));
client_1.client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    await (0, register_1.registerCommands)(readyClient.user.id);
    await setBotAvatar();
    const configs = require('./config').getAllConfigs();
    for (const config of Object.values(configs)) {
        if (config.rulesChannelId) {
            try {
                await (0, rules_1.fetchRules)(config.guildId, config.rulesChannelId);
            }
            catch (e) {
                (0, stats_1.recordAction)(config.guildId, { timestamp: new Date().toISOString(), targetUser: 'SYSTEM', targetRoles: [], channel: 'ALL', violation: false, reason: 'Rules Access Warning', analysis: 'Check permissions.', socialProfile: 'Permissions Required', type: 'NORMAL' });
            }
        }
    }
});
client_1.client.on(discord_js_1.Events.MessageCreate, async (message) => {
    if (!message.guild || !message.channel.isTextBased())
        return;
    const config = (0, config_1.getConfig)(message.guild.id);
    const textChannel = message.channel;
    const currentPulse = (0, stats_1.incrementPulse)(message.guild.id);
    if (currentPulse >= (config?.auditInterval || 100) && !message.author.bot) {
        (0, stats_1.resetPulse)(message.guild.id);
        (0, moderation_1.performMassScan)(textChannel).catch(() => { });
    }
    if (config?.triggerBotId && message.author.id === config.triggerBotId) {
        const targetUser = message.mentions.users.first();
        if (targetUser)
            await (0, moderation_1.handlePotentialInfraction)(textChannel, targetUser, message);
    }
    else if (Math.random() < 0.01 && !message.author.bot) {
        await (0, moderation_1.handlePotentialInfraction)(textChannel, message.author, message, true);
    }
});
client_1.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options, guildId, memberPermissions } = interaction;
            if (commandName === 'setup') {
                if (!memberPermissions?.has('Administrator'))
                    return await interaction.reply({ content: 'Admin only.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                const rulesChannel = options.getChannel('rules-channel'), logChannel = options.getChannel('log-channel');
                if (guildId && rulesChannel && logChannel) {
                    (0, config_1.saveConfig)({ guildId, rulesChannelId: rulesChannel.id, modLogsChannelId: logChannel.id, authorizedUsers: [], auditInterval: 100, defaultTimeout: 10 });
                    await (0, rules_1.fetchRules)(guildId, rulesChannel.id);
                    await interaction.reply({ content: `✅ Server saved! Use \`/dashboard-key\` to set first password.`, flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
            }
            if (commandName === 'config') {
                if (!memberPermissions?.has('Administrator'))
                    return await interaction.reply({ content: 'Admin only.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                const interval = options.getInteger('audit-interval'), timeout = options.getInteger('default-timeout');
                if (guildId) {
                    if (interval)
                        (0, config_1.saveConfig)({ guildId, auditInterval: interval });
                    if (timeout)
                        (0, config_1.saveConfig)({ guildId, defaultTimeout: timeout });
                    await interaction.reply({ content: `✅ Updated!`, flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
            }
            if (commandName === 'dashboard-key') {
                if (!memberPermissions?.has('Administrator'))
                    return await interaction.reply({ content: 'Admin only.', flags: [discord_js_1.MessageFlags.Ephemeral] });
                const key = options.getString('key');
                if (guildId && key) {
                    const config = (0, config_1.getConfig)(guildId) || { guildId, authorizedUsers: [] };
                    if (!config.authorizedUsers.some(u => u.username === 'admin'))
                        config.authorizedUsers.push({ username: 'admin', key, role: 'ADMIN' });
                    else {
                        const admin = config.authorizedUsers.find(u => u.username === 'admin');
                        if (admin)
                            admin.key = key;
                    }
                    (0, config_1.saveConfig)(config);
                    await interaction.reply({ content: '✅ Admin key updated! Login with username "admin".', flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
            }
        }
        if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Analyze Context') {
            if (!interaction.memberPermissions?.has('ManageMessages'))
                return await interaction.reply({ content: 'Unauthorized.', flags: [discord_js_1.MessageFlags.Ephemeral] });
            await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
            const message = interaction.targetMessage;
            if (message.channel.isTextBased()) {
                await (0, moderation_1.handlePotentialInfraction)(message.channel, message.author, message, false, true);
                await interaction.editReply('Analysis requested.');
            }
        }
        if (interaction.isButton() && interaction.customId.startsWith('approve_timeout_')) {
            const parts = interaction.customId.split('_'), targetUserId = parts[2], timeoutMinutes = parseInt(parts[3], 10);
            const member = await interaction.guild?.members.fetch(targetUserId);
            if (member) {
                await member.timeout(timeoutMinutes * 60 * 1000, `AI Approved`);
                (0, stats_1.recordTimeout)(interaction.guildId);
                await interaction.update({ content: `Timeout applied.`, components: [] });
            }
        }
    }
    catch (error) {
        console.error(error);
    }
});
process.on('unhandledRejection', e => console.error(e));
client_1.client.login(process.env.DISCORD_TOKEN);
