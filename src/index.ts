import { Events, TextChannel, MessageFlags, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import cors from 'cors';
import { client } from './client';
import { fetchRules } from './rules';
import { handlePotentialInfraction, performMassScan } from './moderation';
import { registerCommands } from './register';
import { recordTimeout, recordAccess, clearLogs, clearAccessLogs, getGuildStats, getGlobalStats, recordAction, incrementPulse, resetPulse } from './stats';
import { getConfig, saveConfig, AuthorizedUser } from './config';

const app = express();
app.use(cors());
app.use(express.json());

// Helper to validate user/dev
function getAuthorizedGuild(username: any, key: any, requestedGuildId?: string): { guildId: string, role: string, isDev: boolean } | null {
    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    
    const isDev = process.env.DEV_KEY && key === process.env.DEV_KEY;
    if (isDev) {
        return { guildId: requestedGuildId || Object.keys(configs)[0], role: 'DEV', isDev: true };
    }

    const config = Object.values(configs).find((c: any) => 
        c.authorizedUsers.some((u: AuthorizedUser) => u.username === username && u.key === key)
    );

    if (config) {
        const user = (config as any).authorizedUsers.find((u: any) => u.username === username);
        return { guildId: (config as any).guildId, role: user.role, isDev: false };
    }

    return null;
}

app.get('/api/stats', (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const requestedGuildId = req.query.guildId as string;
    
    const auth = getAuthorizedGuild(username, key, requestedGuildId);

    recordAccess({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: !!auth
    });

    if (!auth) return res.status(401).json({ error: 'Unauthorized: Invalid Identity' });
    
    const guildStats = getGuildStats(auth.guildId);
    const globalStats = getGlobalStats();
    const guildConfig = getConfig(auth.guildId);

    res.json({
        ...globalStats,
        ...guildStats,
        guildId: auth.guildId,
        isDev: auth.isDev,
        role: auth.role,
        defaultTimeout: guildConfig?.defaultTimeout || 10,
        authorizedUsers: auth.isDev || auth.role === 'ADMIN' ? guildConfig?.authorizedUsers : []
    });
});

app.get('/api/members', async (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.query.guildId as string);

    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(auth.guildId);
        const members = await guild.members.fetch();
        const memberList = members.map(m => ({
            tag: m.user.tag,
            nickname: m.nickname,
            avatar: m.user.displayAvatarURL(),
            roles: m.roles.cache.map(r => r.name).filter(n => n !== '@everyone'),
            joinedAt: m.joinedAt?.toISOString(),
            status: m.presence?.status || 'offline'
        }));
        res.json(memberList);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});

app.post('/api/users/add', async (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.body.guildId);

    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'DEV')) {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { newUsername, newKey, newRole, guildId } = req.body;
    if (!newUsername || !newKey) return res.status(400).json({ error: 'Username and Key required' });

    const config = getConfig(guildId || auth.guildId);
    if (!config) return res.status(404).json({ error: 'Config not found' });

    if (config.authorizedUsers.some(u => u.username === newUsername)) {
        return res.status(400).json({ error: 'User already exists' });
    }

    config.authorizedUsers.push({ username: newUsername, key: newKey, role: newRole || 'MOD' });
    saveConfig(config);

    res.json({ success: true, message: `User ${newUsername} authorized.` });
});

app.get('/api/dev/guilds', (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY) return res.status(403).json({ error: 'Forbidden' });
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.iconURL(), memberCount: g.memberCount }));
    res.json(guilds);
});

app.delete('/api/dev/clear', (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY) return res.status(403).json({ error: 'Forbidden' });
    const { target, guildId } = req.body;
    if (target === 'logs' && guildId) { clearLogs(guildId); res.json({ success: true }); }
    else if (target === 'access') { clearAccessLogs(); res.json({ success: true }); }
    else res.status(400).json({ error: 'Invalid target' });
});

app.get('/api/channels', async (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const auth = getAuthorizedGuild(username, key, req.query.guildId as string);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(auth.guildId);
        const fetchedChannels = await guild.channels.fetch();
        const sensitiveKeywords = ['mod', 'admin', 'staff', 'log', 'private', 'dev'];
        const channels = fetchedChannels
            .filter(c => c !== null && c.isTextBased() && !c.isThread())
            .filter(c => {
                if (auth.isDev) return true; 
                const name = (c as any).name.toLowerCase();
                return !sensitiveKeywords.some(word => name.includes(word));
            })
            .map(c => ({ id: c!.id, name: (c as any).name }));
        res.json(channels);
    } catch (e) { res.status(500).json({ error: 'Failed to fetch channels' }); }
});

app.post('/api/timeout', async (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const { guildId, userTag, minutes, reason } = req.body;
    const auth = getAuthorizedGuild(username, key, guildId);
    
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(auth.guildId);
        let member = guild.members.cache.find(m => m.user.tag === userTag || m.user.username === userTag);
        if (!member) {
            const results = await guild.members.search({ query: userTag, limit: 1 });
            member = results.first();
        }
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const botMember = await guild.members.fetch(client.user!.id);
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            return res.status(403).json({ error: 'Hierarchy Error: Move bot role to top!' });
        }

        await member.timeout(minutes * 60 * 1000, `Neural Enforcement by ${username}: ${reason || 'Manual'}`);
        recordTimeout(auth.guildId);
        recordAction(auth.guildId, {
            timestamp: new Date().toISOString(),
            targetUser: userTag,
            targetRoles: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone'),
            channel: 'DASHBOARD',
            violation: true,
            reason: `Manual Enforcement by ${username}`,
            analysis: `Enforced via Web Dashboard by user: ${username}`,
            socialProfile: 'Enforced Identity',
            type: 'INFRACTION'
        });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/private-scan', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY) return res.status(403).json({ error: 'Forbidden' });
    const { channelId } = req.body;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Not found' });
        const textChannel = channel as TextChannel;
        const messages = await textChannel.messages.fetch({ limit: 100 });
        const transcript = [];
        for (const m of Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
            const member = m.member || await textChannel.guild.members.fetch(m.author.id);
            transcript.push({ id: m.id, author: m.author.tag, roles: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone'), content: m.content, timestamp: m.createdAt.toISOString() });
        }
        res.json({ channel: textChannel.name, messages: transcript });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/mass-scan', async (req, res) => {
    const username = req.headers['x-username'];
    const key = req.headers['x-api-key'];
    const { channelId } = req.body;
    const auth = getAuthorizedGuild(username, key);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Not found' });
        const textChannel = channel as TextChannel;
        if (!auth.isDev && textChannel.guild.id !== auth.guildId) return res.status(403).json({ error: 'Forbidden' });
        const report = await performMassScan(textChannel);
        res.json(report);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

async function setBotAvatar() {
    const fs = require('fs');
    const path = require('path');
    const avatarPath = path.join(__dirname, '../Profile Pic.png');
    if (fs.existsSync(avatarPath)) { try { await client.user!.setAvatar(avatarPath); } catch (e) {} }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  await registerCommands(readyClient.user.id);
  await setBotAvatar();
  const configs: Record<string, any> = require('./config').getAllConfigs();
  for (const config of Object.values(configs)) {
      if (config.rulesChannelId) {
          try { await fetchRules(config.guildId, config.rulesChannelId); } catch (e) {
              recordAction(config.guildId, { timestamp: new Date().toISOString(), targetUser: 'SYSTEM', targetRoles: [], channel: 'ALL', violation: false, reason: 'Rules Access Warning', analysis: 'Check permissions.', socialProfile: 'Permissions Required', type: 'NORMAL' });
          }
      }
  }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.channel.isTextBased()) return;
    const config = getConfig(message.guild.id);
    const textChannel = message.channel as TextChannel;
    const currentPulse = incrementPulse(message.guild.id);
    if (currentPulse >= (config?.auditInterval || 100) && !message.author.bot) {
        resetPulse(message.guild.id);
        performMassScan(textChannel).catch(() => {});
    }
    if (config?.triggerBotId && message.author.id === config.triggerBotId) {
        const targetUser = message.mentions.users.first();
        if (targetUser) await handlePotentialInfraction(textChannel, targetUser, message);
    } else if (Math.random() < 0.01 && !message.author.bot) {
        await handlePotentialInfraction(textChannel, message.author, message, true);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options, guildId, memberPermissions } = interaction;
            if (commandName === 'setup') {
                if (!memberPermissions?.has('Administrator')) return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                const rulesChannel = options.getChannel('rules-channel');
                const logChannel = options.getChannel('log-channel');
                if (guildId && rulesChannel && logChannel) {
                    saveConfig({ guildId, rulesChannelId: rulesChannel.id, modLogsChannelId: logChannel.id, auditInterval: 100, defaultTimeout: 10 });
                    await fetchRules(guildId, rulesChannel.id);
                    await interaction.reply({ content: `✅ Server saved! Use \`/dashboard-key\` to set first password.`, flags: [MessageFlags.Ephemeral] });
                }
            }
            if (commandName === 'config') {
                if (!memberPermissions?.has('Administrator')) return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                const interval = options.getInteger('audit-interval');
                const timeout = options.getInteger('default-timeout');
                if (guildId) {
                    if (interval) saveConfig({ guildId, auditInterval: interval });
                    if (timeout) saveConfig({ guildId, defaultTimeout: timeout });
                    await interaction.reply({ content: `✅ Updated!`, flags: [MessageFlags.Ephemeral] });
                }
            }
            if (commandName === 'dashboard-key') {
                if (!memberPermissions?.has('Administrator')) return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                const key = options.getString('key');
                if (guildId && key) {
                    const config = getConfig(guildId) || { guildId, authorizedUsers: [] };
                    if (!config.authorizedUsers.some(u => u.username === 'admin')) {
                        config.authorizedUsers.push({ username: 'admin', key, role: 'ADMIN' });
                    } else {
                        const admin = config.authorizedUsers.find(u => u.username === 'admin');
                        if (admin) admin.key = key;
                    }
                    saveConfig(config);
                    await interaction.reply({ content: '✅ Admin key updated! Login with username "admin".', flags: [MessageFlags.Ephemeral] });
                }
            }
        }
        if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Analyze Context') {
            if (!interaction.memberPermissions?.has('ManageMessages')) return await interaction.reply({ content: 'Unauthorized.', flags: [MessageFlags.Ephemeral] });
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const message = interaction.targetMessage;
            if (message.channel.isTextBased()) {
                await handlePotentialInfraction(message.channel as TextChannel, message.author, message as any, false, true);
                await interaction.editReply('Analysis requested.');
            }
        }
        if (interaction.isButton() && interaction.customId.startsWith('approve_timeout_')) {
            const parts = interaction.customId.split('_');
            const targetUserId = parts[2], timeoutMinutes = parseInt(parts[3], 10);
            const member = await interaction.guild?.members.fetch(targetUserId);
            if (member) {
                await member.timeout(timeoutMinutes * 60 * 1000, `AI Approved`);
                recordTimeout(interaction.guildId!);
                await interaction.update({ content: `Timeout applied.`, components: [] });
            }
        }
    } catch (error) { console.error(error); }
});

process.on('unhandledRejection', e => console.error(e));
client.login(process.env.DISCORD_TOKEN);
