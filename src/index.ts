import { Client, GatewayIntentBits, Partials, Events, TextChannel, EmbedBuilder } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { fetchRules } from './rules';
import { handlePotentialInfraction, performMassScan } from './moderation';
import { registerCommands } from './register';
import { getGlobalStats, recordAccess, recordTimeout } from './stats';

dotenv.config();

const TARGET_GUILD_ID = '1487617515440963718';

// Ensure required environment variables are set
if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is missing in .env");
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in .env");

// Initialize Express for Dashboard API
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/stats', (req, res) => {
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const isAuthorized = key === process.env.DASHBOARD_KEY;

    // Record the access attempt
    recordAccess({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: isAuthorized
    });

    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json(getGlobalStats());
});

app.get('/api/channels', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (key !== process.env.DASHBOARD_KEY) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const guild = await client.guilds.fetch(TARGET_GUILD_ID);
        const channels = await guild.channels.fetch();
        const textChannels = channels
            .filter(c => c !== null && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c!.id, name: (c as any).name }));
        res.json(textChannels);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

app.post('/api/purge', async (req, res) => {
    const key = req.headers['x-api-key'];
    const { channelId } = req.body;
    if (key !== process.env.DASHBOARD_KEY) return res.status(401).json({ error: 'Unauthorized' });
    if (!channelId) return res.status(400).json({ error: 'Channel ID required' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Channel not found' });
        
        const textChannel = channel as TextChannel;
        // Discord bulkDelete is limited to 100 messages and messages < 14 days old
        // For a full "clear", we'll do one batch of 100.
        const deleted = await textChannel.bulkDelete(100, true);
        res.json({ success: true, count: deleted.size });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Purge failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));

// Initialize the Discord client
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Initialize the Gemini AI client
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  
  await registerCommands(readyClient.user.id);
  
  // Fetch rules on startup for the target guild
  if (process.env.RULES_CHANNEL_ID) {
      const targetGuild = client.guilds.cache.get(TARGET_GUILD_ID);
      if (targetGuild) {
          await fetchRules(process.env.RULES_CHANNEL_ID);
          console.log(`Pre-cached rules for target guild: ${TARGET_GUILD_ID}`);
      } else {
          console.error(`Warning: Bot is not in the target guild ${TARGET_GUILD_ID}`);
      }
  }
});

client.on(Events.MessageCreate, async (message) => {
    // Only process messages from the target guild
    if (!message.guild || message.guild.id !== TARGET_GUILD_ID || !message.channel.isTextBased()) return;
    
    // Check if the message is from the trigger bot (e.g., Arcane)
    if (process.env.TRIGGER_BOT_ID && message.author.id === process.env.TRIGGER_BOT_ID) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
            await handlePotentialInfraction(message.channel as TextChannel, targetUser, message);
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    // Only process interactions from the target guild
    if (interaction.guildId !== TARGET_GUILD_ID) return;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'refresh-rules') {
            if (!interaction.memberPermissions?.has('Administrator')) {
                await interaction.reply({ content: 'You do not have permission to use this.', ephemeral: true });
                return;
            }
            if (process.env.RULES_CHANNEL_ID) {
                await interaction.deferReply({ ephemeral: true });
                await fetchRules(process.env.RULES_CHANNEL_ID);
                await interaction.editReply('Rules successfully refreshed!');
            } else {
                await interaction.reply({ content: 'RULES_CHANNEL_ID not set.', ephemeral: true });
            }
        }

        if (interaction.commandName === 'mass-scan') {
            if (!interaction.memberPermissions?.has('ManageMessages')) {
                await interaction.reply({ content: 'You do not have permission to use this.', ephemeral: true });
                return;
            }
            await interaction.deferReply();
            
            try {
                const result = await performMassScan(interaction.channel as TextChannel);
                if (!result) {
                    await interaction.editReply('Mass scan failed.');
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Community Health Audit: #${(interaction.channel as any).name}`)
                    .setDescription(result.generalConclusion)
                    .setColor(0x00ff00)
                    .addFields(
                        { name: 'Messages Analyzed', value: result.totalMessages.toString(), inline: true },
                        { name: 'Active Users', value: result.usersAnalyzed.length.toString(), inline: true }
                    )
                    .setTimestamp();

                result.usersAnalyzed.slice(0, 10).forEach(user => {
                    embed.addFields({ 
                        name: `${user.userTag} [${user.riskLevel}]`, 
                        value: user.behaviorSummary 
                    });
                });

                await interaction.editReply({ embeds: [embed] });
            } catch (e: any) {
                await interaction.editReply(`Error: ${e.message}`);
            }
        }
    }
    
    if (interaction.isMessageContextMenuCommand()) {
        if (interaction.commandName === 'Analyze Context') {
            if (!interaction.memberPermissions?.has('ManageMessages')) {
                await interaction.reply({ content: 'You do not have permission to use this.', ephemeral: true });
                return;
            }
            await interaction.deferReply({ ephemeral: true });
            
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
                    recordTimeout();
                    await interaction.update({ content: `Timeout of ${timeoutMinutes}m applied to <@${targetUserId}> by ${interaction.user.tag}.`, components: [] });
                } else {
                    await interaction.update({ content: `User not found in server.`, components: [] });
                }
            } catch (err) {
                console.error(err);
                await interaction.reply({ content: 'Failed to apply timeout. Check my permissions.', ephemeral: true });
            }
        }
    }
});

// Basic error handling
process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
