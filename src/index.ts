import { Events, TextChannel, MessageFlags } from 'discord.js';
import express from 'express';
import cors from 'cors';
import { client } from './client';
import { fetchRules } from './rules';
import { handlePotentialInfraction, performMassScan } from './moderation';
import { registerCommands } from './register';
import { recordTimeout, recordAccess, clearLogs, clearAccessLogs, getGuildStats, getGlobalStats } from './stats';

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
        const config = Object.values(configs).find((c: any) => c.dashboardKey === key);
        if (config) authorizedGuildId = (config as any).guildId;
    }

    const isAuthorized = !!authorizedGuildId;

    // Record the access attempt
    recordAccess({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: isAuthorized
    });

    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const guildStats = getGuildStats(authorizedGuildId!);
    const globalStats = getGlobalStats();

    res.json({
        ...globalStats,
        ...guildStats,
        guildId: authorizedGuildId,
        isDev: !!isDevKey
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
        const config = Object.values(configs).find((c: any) => c.dashboardKey === key);
        if (config) targetGuildId = (config as any).guildId;
    }

    if (!targetGuildId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(targetGuildId);
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
    } catch (error) {
        console.error('[API] Failed to fetch channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
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
        
        // Ensure members are fetched so roles are available
        try {
            await textChannel.guild.members.fetch();
        } catch (e) {
            console.log("[API] Failed to bulk fetch members for private scan, falling back to cache.");
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
    const isAuthorized = key === process.env.DASHBOARD_KEY || (process.env.DEV_KEY && key === process.env.DEV_KEY);
    
    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'channelId is required' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Channel not found or not text-based' });
        }

        const report = await performMassScan(channel as TextChannel);
        
        if (!report) return res.status(500).json({ error: 'Scan failed' });
        
        res.json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred during mass scan' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  
  await registerCommands(readyClient.user.id);
  
  // Initialize all configured server rules on startup
  const { getAllConfigs } = require('./config');
  const configs: Record<string, any> = getAllConfigs();
  const { fetchRules } = require('./rules');

  for (const config of Object.values(configs)) {
      if (config.rulesChannelId) {
          console.log(`[Startup] Fetching rules for guild ${config.guildId}...`);
          await fetchRules(config.guildId, config.rulesChannelId);
      }
  }
});

client.on(Events.MessageCreate, async (message) => {
    // Ignore direct messages
    if (!message.guild || !message.channel.isTextBased()) return;
    
    // Check if the message is from the trigger bot (e.g., Arcane)
    if (process.env.TRIGGER_BOT_ID && message.author.id === process.env.TRIGGER_BOT_ID) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
            await handlePotentialInfraction(message.channel as TextChannel, targetUser, message);
        }
    } else {
        // PROACTIVE NEURAL PROFILING (1% chance on any message)
        if (Math.random() < 0.01 && !message.author.bot) {
            await handlePotentialInfraction(message.channel as TextChannel, message.author, message, true);
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
                    const { saveConfig } = require('./config');
                    saveConfig({
                        guildId,
                        rulesChannelId: rulesChannel.id,
                        modLogsChannelId: logChannel.id,
                        triggerBotId: triggerBot || undefined
                    });
                    
                    const { fetchRules } = require('./rules');
                    await fetchRules(guildId, rulesChannel.id);
                    
                    await interaction.reply({ 
                        content: `✅ **Server configuration saved!**\n\n**Next Steps:**\n1. Use \`/dashboard-key\` to set your private access password.\n2. Open the [Neural Dashboard](https://varun-chinthoju.github.io/ModerationPlus/) to monitor and audit your community.`, 
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
                    const { saveConfig } = require('./config');
                    saveConfig({ guildId, dashboardKey: key });
                    await interaction.reply({ content: '✅ Dashboard key updated!', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.commandName === 'refresh-rules') {
                if (!interaction.memberPermissions?.has('Administrator')) {
                    await interaction.reply({ content: 'You do not have permission to use this.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const { getConfig } = require('./config');
                const config = getConfig(interaction.guildId);
                if (config?.rulesChannelId) {
                    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                    const { fetchRules } = require('./rules');
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
                    await handlePotentialInfraction(message.channel as TextChannel, message.author, message as any);
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

// Basic error handling
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
