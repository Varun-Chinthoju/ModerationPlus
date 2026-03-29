import { TextChannel, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User, Collection, PermissionsBitField } from 'discord.js';
import { analyzeContext, analyzeMassScan, MassScanResult } from './ai';
import { client } from './client';
import { recordAction, recordMassScan } from './stats';
import { getConfig } from './config';

export async function handlePotentialInfraction(
    channel: TextChannel, 
    targetUser: User, 
    triggerMessage: Message, 
    isProactive: boolean = false,
    forceLog: boolean = false
) {
    const config = getConfig(channel.guild.id);
    if (!config) return;

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
    let roles: string[] = [];
    try {
        let member = channel.guild.members.cache.get(targetUser.id);
        if (!member) {
            member = await channel.guild.members.fetch(targetUser.id);
        }
        roles = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
    } catch (e) {
        console.log(`[Access] Could not fetch roles for ${targetUser.tag}, using defaults.`);
    }

    // Gather context
    const messages = await channel.messages.fetch({ limit: 50, before: triggerMessage.id });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    
    // Analyze
    const analysis = await analyzeContext(channel.guild.id, transcript, targetUser.tag, roles);
    
    if (!analysis) {
        console.error("Analysis failed.");
        return;
    }

    recordAction(channel.guild.id, {
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
    if (!shouldLogToDiscord) return;
    
    const modLogsChannelId = config.modLogsChannelId;
    if (!modLogsChannelId) return;
    
    try {
        const modLogsChannel = await client.channels.fetch(modLogsChannelId);
        if (!modLogsChannel || !modLogsChannel.isTextBased()) return;
        
        const textChannel = modLogsChannel as TextChannel;
        const embed = new EmbedBuilder()
            .setTitle(analysis.violation ? `Potential Rule Violation: ${targetUser.tag}` : `Neural Safety Audit: ${targetUser.tag}`)
            .setColor(analysis.violation ? 0xff0000 : 0x00ff00)
            .addFields(
                { name: 'Status', value: analysis.violation ? '🔴 Risk Detected' : '🟢 Safety Verified', inline: true },
                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                { name: 'User Roles', value: roles.join(', ') || 'None', inline: true },
                { name: 'Behavior Profile', value: analysis.socialProfile || 'Neutral profiling engaged.' },
                { name: 'Short Reason', value: analysis.shortReason },
                { name: 'Detailed Analysis', value: analysis.detailedAnalysis }
            )
            .setTimestamp();

        if (analysis.violation) {
            embed.addFields({ name: 'Suggested Timeout', value: `${analysis.timeoutMinutes} minutes`, inline: true });
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`approve_timeout_${targetUser.id}_${analysis.timeoutMinutes}`).setLabel(`Approve Timeout (${analysis.timeoutMinutes}m)`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`dismiss_warning_${targetUser.id}`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary)
            );
            await textChannel.send({ embeds: [embed], components: [row] });
        } else {
            await textChannel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error(`[Moderation] Failed to send to mod logs:`, e);
    }
}

interface ChannelCache {
    messages: Message[];
    lastId: string;
}

const massScanCache = new Map<string, ChannelCache>();

export async function performMassScan(channel: TextChannel): Promise<MassScanResult | null> {
    const permissions = channel.permissionsFor(client.user!);
    if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel) || !permissions.has(PermissionsBitField.Flags.ReadMessageHistory)) {
        throw new Error('Missing Access: Bot cannot see that channel.');
    }

    console.log(`Starting mass scan for channel: #${channel.name}`);
    let currentCache = massScanCache.get(channel.id);
    let allMessages: Message[] = [];
    
    try {
        if (currentCache) {
            let newMessages: Message[] = [];
            let afterId = currentCache.lastId;
            while (true) {
                const fetched = await channel.messages.fetch({ limit: 100, after: afterId }) as unknown as Collection<string, Message>;
                if (fetched.size === 0) break;
                newMessages = newMessages.concat(Array.from(fetched.values()));
                afterId = fetched.first()?.id as string;
                if (newMessages.length >= 500) break; 
            }
            allMessages = [...newMessages, ...currentCache.messages].slice(0, 500);
        } else {
            let lastId: string | undefined;
            for (let i = 0; i < 5; i++) {
                const options: any = { limit: 100 };
                if (lastId) options.before = lastId;
                const fetched = await channel.messages.fetch(options) as unknown as Collection<string, Message>;
                if (fetched.size === 0) break;
                allMessages = allMessages.concat(Array.from(fetched.values()));
                lastId = fetched.last()?.id;
            }
        }
    } catch (e: any) {
        if (e.code === 50001) throw new Error('Missing Access: Bot cannot read history in that channel.');
        throw e;
    }
    
    const sorted = [...allMessages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const uniqueAuthors = Array.from(new Set(sorted.map(m => m.author.id)));
    const rolesMap: Record<string, string[]> = {};
    
    // OPTIMIZED: Batch fetch users to avoid Opcode 8 rate limits
    try {
        const members = await channel.guild.members.fetch({ user: uniqueAuthors });
        members.forEach(member => {
            rolesMap[member.user.tag] = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
        });
    } catch (e) {
        console.log("[Mass Scan] Failed batch member fetch, using message metadata.");
        sorted.forEach(m => {
            if (!rolesMap[m.author.tag]) rolesMap[m.author.tag] = [];
        });
    }

    const rolesString = Object.entries(rolesMap).map(([tag, roles]) => `${tag}: [${roles.join(', ')}]`).join('\n');

    if (allMessages.length > 0) {
        const latestMsg = allMessages.reduce((prev, current) => (prev.createdTimestamp > current.createdTimestamp) ? prev : current);
        massScanCache.set(channel.id, { messages: allMessages, lastId: latestMsg.id });
    }
    
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    const result = await analyzeMassScan(channel.guild.id, transcript, sorted.length, rolesString);
    
    if (result) {
        const fullReport = {
            timestamp: new Date().toISOString(),
            channel: channel.name,
            totalMessages: result.totalMessages,
            generalConclusion: result.generalConclusion,
            usersAnalyzed: result.usersAnalyzed
        };
        recordMassScan(channel.guild.id, fullReport);
        return fullReport as any;
    }
    return null;
}
