import { Events, TextChannel, MessageFlags, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import cors from 'cors';
import { client } from './client';
import { fetchRules } from './rules';
import { handlePotentialInfraction, performMassScan } from './moderation';
import { registerCommands } from './register';
import { recordTimeout, recordAccess, clearLogs, clearAccessLogs, getGuildStats, getGlobalStats, recordAction, incrementPulse, resetPulse } from './stats';
import { getConfig, saveConfig } from './config';

// Initialize Express for Dashboard API
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/stats', (req, res) => {
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const requestedGuildId = req.query.guildId as string;
    
    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    
    const isDevKey = process.env.DEV_KEY && key === process.env.DEV_KEY;
    
    let authorizedGuildId: string | null = null;
    if (isDevKey) {
        authorizedGuildId = requestedGuildId || Object.keys(configs)[0];
    } else {
        const config = Object.values(configs).find((c: any) => c.dashboardKey === key && key !== undefined && key !== '');
        if (config) authorizedGuildId = (config as any).guildId;
    }

    const isAuthorized = !!authorizedGuildId;

    recordAccess({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: isAuthorized
    });

    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or Empty Key' });
    }
    
    const guildStats = getGuildStats(authorizedGuildId!);
    const globalStats = getGlobalStats();
    const guildConfig = getConfig(authorizedGuildId!);

    res.json({
        ...globalStats,
        ...guildStats,
        guildId: authorizedGuildId,
        isDev: !!isDevKey,
        defaultTimeout: guildConfig?.defaultTimeout || 10 // FIXED: Pass default timeout to dashboard
    });
});

app.get('/api/dev/guilds', (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const guilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL(),
        memberCount: g.memberCount
    }));

    res.json(guilds);
});

app.delete('/api/dev/clear', (req, res) => {
    const key = req.headers['x-api-key'];
    const isDevAuthorized = process.env.DEV_KEY && key === process.env.DEV_KEY;
    const guildId = req.body.guildId;

    if (!isDevAuthorized) {
        return res.status(403).json({ error: 'Forbidden: Developer Key Required' });
    }

    const { target } = req.body;
    if (target === 'logs' && guildId) {
        clearLogs(guildId);
        res.json({ success: true, message: 'Neural monitoring logs cleared' });
    } else if (target === 'access') {
        clearAccessLogs();
        res.json({ success: true, message: 'Access logs cleared' });
    } else {
        res.status(400).json({ error: 'Invalid clear target' });
    }
});

app.get('/api/channels', async (req, res) => {
    const key = req.headers['x-api-key'];
    const requestedGuildId = req.query.guildId as string;
    
    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    
    const isDev = process.env.DEV_KEY && key === process.env.DEV_KEY;
    
    let targetGuildId: string | null = null;
    if (isDev) {
        targetGuildId = requestedGuildId || Object.keys(configs)[0];
    } else {
        const config = Object.values(configs).find((c: any) => c.dashboardKey === key && key !== undefined && key !== '');
        if (config) targetGuildId = (config as any).guildId;
    }

    if (!targetGuildId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(targetGuildId);
        if (!guild) return res.status(404).json({ error: 'Server not found' });

        const fetchedChannels = await guild.channels.fetch();

        const sensitiveKeywords = ['mod', 'admin', 'staff', 'log', 'private', 'dev'];

        const channels = fetchedChannels
            .filter(c => c !== null && c.isTextBased() && !c.isThread())
            .filter(c => {
                if (isDev) return true; 
                const name = (c as any).name.toLowerCase();
                return !sensitiveKeywords.some(word => name.includes(word));
            })
            .map(c => ({ id: c!.id, name: (c as any).name }));

        res.json(channels);
    } catch (error: any) {
        if (error.code === 10004) return res.status(404).json({ error: 'Unknown Guild: Bot is no longer in this server.' });
        console.error('[API] Failed to fetch channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

app.post('/api/timeout', async (req, res) => {
    const key = req.headers['x-api-key'];
    const { guildId, userTag, minutes, reason } = req.body;
    
    if (!guildId || !userTag || !minutes) return res.status(400).json({ error: 'guildId, userTag, and minutes are required' });

    const isDev = process.env.DEV_KEY && key === process.env.DEV_KEY;
    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    const config = Object.values(configs).find((c: any) => c.dashboardKey === key && key !== undefined && key !== '');
    
    // Authorization Check
    if (!isDev && (!config || (config as any).guildId !== guildId)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        let member = guild.members.cache.find(m => m.user.tag === userTag || m.user.username === userTag);
        if (!member) {
            const members = await guild.members.fetch();
            member = members.find(m => m.user.tag === userTag || m.user.username === userTag);
        }

        if (!member) return res.status(404).json({ error: 'Member not found in server' });

        await member.timeout(minutes * 60 * 1000, `Neural Enforcement by Dashboard: ${reason || 'No reason provided'}`);
        recordTimeout(guildId);
        
        recordAction(guildId, {
            timestamp: new Date().toISOString(),
            targetUser: userTag,
            targetRoles: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone'),
            channel: 'DASHBOARD',
            violation: true,
            reason: `Manual Neural Enforcement: ${minutes}m timeout.`,
            analysis: `Enforced via Web Dashboard. Reason: ${reason || 'Manual override'}`,
            socialProfile: 'Enforced Intelligence',
            type: 'INFRACTION'
        });

        res.json({ success: true, message: `Member ${userTag} timed out for ${minutes}m.` });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to apply timeout' });
    }
});

app.post('/api/dev/private-scan', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (!process.env.DEV_KEY || key !== process.env.DEV_KEY) {
        return res.status(403).json({ error: 'Forbidden: Developer Identity Required' });
    }

    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'channelId is required' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const textChannel = channel as TextChannel;

        // Permission Check
        const permissions = textChannel.permissionsFor(client.user!);
        if (!permissions || !permissions.has('ViewChannel') || !permissions.has('ReadMessageHistory')) {
            return res.status(403).json({ error: 'Forbidden: Missing Bot Permissions for this channel' });
        }

        const messages = await textChannel.messages.fetch({ limit: 100 });
        
        const authorIds = Array.from(new Set(messages.map(m => m.author.id)));
        try {
            await textChannel.guild.members.fetch({ user: authorIds });
        } catch (e) {
            console.log("[API] Failed to batch fetch members for private scan.");
        }

        const transcript = Array.from(messages.values())
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .map(m => {
                let roles: string[] = [];
                try {
                    roles = m.member?.roles.cache.map(r => r.name).filter(n => n !== '@everyone') || [];
                } catch (e) {}

                return {
                    id: m.id,
                    author: m.author.tag,
                    roles: roles,
                    content: m.content,
                    timestamp: m.createdAt.toISOString()
                };
            });

        res.json({
            channel: textChannel.name,
            messages: transcript
        });
    } catch (error) {
        console.error('[API] Private scan error:', error);
        res.status(500).json({ error: 'Private fetch failed' });
    }
});

app.post('/api/mass-scan', async (req, res) => {
    const key = req.headers['x-api-key'];
    const { channelId } = req.body;
    
    if (!channelId) return res.status(400).json({ error: 'channelId is required' });

    const { getAllConfigs } = require('./config');
    const configs = getAllConfigs();
    
    const isDevKey = process.env.DEV_KEY && key === process.env.DEV_KEY;
    
    // Find authorized guild
    let authorizedGuildId: string | null = null;
    if (isDevKey) {
        try {
            const tempChannel = await client.channels.fetch(channelId);
            if (tempChannel && 'guild' in tempChannel) {
                authorizedGuildId = tempChannel.guild.id;
            }
        } catch (e) {}
    } else {
        const config = Object.values(configs).find((c: any) => c.dashboardKey === key && key !== undefined && key !== '');
        if (config) authorizedGuildId = (config as any).guildId;
    }

    if (!authorizedGuildId) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Key' });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Channel not found or not text-based' });
        }

        const textChannel = channel as TextChannel;

        if (!isDevKey && textChannel.guild.id !== authorizedGuildId) {
            return res.status(403).json({ error: 'Forbidden: You can only scan channels in your own server.' });
        }

        const report = await performMassScan(textChannel);
        
        if (!report) return res.status(500).json({ error: 'Scan failed' });
        
        res.json(report);
    } catch (error: any) {
        const message = error.message || 'Mass scan failed';
        if (message.includes('Missing Access')) {
            return res.status(403).json({ error: message });
        }
        console.error(error);
        res.status(500).json({ error: message });
    }
});

async function setBotAvatar() {
    const fs = require('fs');
    const path = require('path');
    const avatarPath = path.join(__dirname, '../Profile Pic.png');
    if (fs.existsSync(avatarPath)) {
        try {
            await client.user!.setAvatar(avatarPath);
            console.log('[Identity] Bot avatar updated successfully.');
        } catch (e) {
            console.log('[Identity] Avatar update skipped (rate limited or same image).');
        }
    }
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
          console.log(`[Startup] Fetching rules for guild ${config.guildId}...`);
          try {
              await fetchRules(config.guildId, config.rulesChannelId);
          } catch (e) {
              console.log(`[Startup] Could not fetch rules for ${config.guildId} (Missing Access)`);
          }
      }
  }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.channel.isTextBased()) return;
    
    const config = getConfig(message.guild.id);
    const textChannel = message.channel as TextChannel;
    
    const currentPulse = incrementPulse(message.guild.id);
    const pulseThreshold = config?.auditInterval || 100;

    if (currentPulse >= pulseThreshold && !message.author.bot) {
        console.log(`[Neural Pulse] Threshold reached (${pulseThreshold}). Running auto-audit in #${textChannel.name}`);
        resetPulse(message.guild.id);
        
        performMassScan(textChannel).then(report => {
            if (report) console.log(`[Neural Pulse] Auto-audit completed for #${textChannel.name}`);
        }).catch(e => {
            console.log(`[Neural Pulse] Auto-audit failed for #${textChannel.name}: ${e.message}`);
        });
    }

    if (config?.triggerBotId && message.author.id === config.triggerBotId) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
            await handlePotentialInfraction(textChannel, targetUser, message);
        }
    } else {
        if (Math.random() < 0.01 && !message.author.bot) {
            await handlePotentialInfraction(textChannel, message.author, message, true);
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options, guildId, memberPermissions } = interaction;

            if (commandName === 'setup') {
                if (!memberPermissions?.has('Administrator')) {
                    return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                }
                const rulesChannel = options.getChannel('rules-channel');
                const logChannel = options.getChannel('log-channel');
                const triggerBot = options.getString('trigger-bot');

                if (guildId && rulesChannel && logChannel) {
                    saveConfig({
                        guildId,
                        rulesChannelId: rulesChannel.id,
                        modLogsChannelId: logChannel.id,
                        triggerBotId: triggerBot || undefined,
                        auditInterval: 100,
                        defaultTimeout: 10 // FIXED: Initialize default timeout
                    });
                    
                    await fetchRules(guildId, rulesChannel.id);
                    
                    await interaction.reply({ 
                        content: `✅ **Server configuration saved!**\n\n**Next Steps:**\n1. Use \`/dashboard-key\` to set your private access password.\n2. Open the [Neural Dashboard](https://varun-chinthoju.github.io/ModerationPlus/) to monitor and audit your community.`, 
                        flags: [MessageFlags.Ephemeral] 
                    });
                }
            }

            if (commandName === 'config') {
                if (!memberPermissions?.has('Administrator')) {
                    return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                }
                const interval = options.getInteger('audit-interval');
                const timeout = options.getInteger('default-timeout'); // FIXED: Handle default-timeout option
                
                if (guildId) {
                    if (interval) saveConfig({ guildId, auditInterval: interval });
                    if (timeout) saveConfig({ guildId, defaultTimeout: timeout });
                    
                    await interaction.reply({ 
                        content: `✅ **Configuration updated!**\n\n${interval ? `• Audit Interval: every **${interval}** messages\n` : ''}${timeout ? `• Default Timeout: **${timeout}** minutes` : ''}`, 
                        flags: [MessageFlags.Ephemeral] 
                    });
                }
            }

            if (commandName === 'dashboard-key') {
                if (!memberPermissions?.has('Administrator')) {
                    return await interaction.reply({ content: 'Admin only.', flags: [MessageFlags.Ephemeral] });
                }
                const key = options.getString('key');
                if (guildId && key) {
                    saveConfig({ guildId, dashboardKey: key });
                    await interaction.reply({ content: '✅ Dashboard key updated!', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.commandName === 'refresh-rules') {
                if (!interaction.memberPermissions?.has('Administrator')) {
                    await interaction.reply({ content: 'You do not have permission to use this.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const config = getConfig(interaction.guildId!);
                if (config?.rulesChannelId) {
                    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                    await fetchRules(interaction.guildId!, config.rulesChannelId);
                    await interaction.editReply('Rules successfully refreshed!');
                } else {
                    await interaction.reply({ content: 'Rules channel not configured. Use /setup first.', flags: [MessageFlags.Ephemeral] });
                }
            }
        }
        
        if (interaction.isMessageContextMenuCommand()) {
            if (interaction.commandName === 'Analyze Context') {
                if (!interaction.memberPermissions?.has('ManageMessages')) {
                    await interaction.reply({ content: 'You do not have permission to use this.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                
                const message = interaction.targetMessage;
                if (message.channel.isTextBased()) {
                    await handlePotentialInfraction(message.channel as TextChannel, message.author, message as any, false, true);
                    await interaction.editReply('Analysis requested. Check the mod logs channel for results.');
                } else {
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
                
                if (!interaction.guild || !targetUserId || !timeoutMinutesStr) return;
                const timeoutMinutes = parseInt(timeoutMinutesStr, 10);
                
                try {
                    const member = await interaction.guild.members.fetch(targetUserId);
                    if (member) {
                        await member.timeout(timeoutMinutes * 60 * 1000, `AI Moderation approved by ${interaction.user.tag}`);
                        recordTimeout(interaction.guildId!);
                        await interaction.update({ content: `Timeout of ${timeoutMinutes}m applied to <@${targetUserId}> by ${interaction.user.tag}.`, components: [] });
                    } else {
                        await interaction.update({ content: `User not found in server.`, components: [] });
                    }
                } catch (err) {
                    console.error(err);
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: 'Failed to apply timeout. Check my permissions.', flags: [MessageFlags.Ephemeral] });
                    } else {
                        await interaction.reply({ content: 'Failed to apply timeout. Check my permissions.', flags: [MessageFlags.Ephemeral] });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Interaction Error:', error);
    }
});

process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
