import { TextChannel, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User, Collection } from 'discord.js';
import { analyzeContext, analyzeMassScan, MassScanResult } from './ai';
import { client } from './client';
import { recordAction, recordMassScan } from './stats';

export async function handlePotentialInfraction(channel: TextChannel, targetUser: User, triggerMessage: Message, isProactive: boolean = false) {
    // Vulcan Protection & Developer Identity
    const isVulcan = targetUser.tag === 'vulcan_999456' || targetUser.username === 'vulcan_999456';
    const testPhrases = ['testing bot', 'test bot', 'bot test', 'ignore this'];
    const content = triggerMessage.content.toLowerCase();

    if (isVulcan) {
        if (testPhrases.some(phrase => content.includes(phrase))) {
            console.log(`[Developer] Skipping analysis for Vulcan's test message.`);
            return;
        }
    }

    console.log(`${isProactive ? '[Proactive]' : '[Triggered]'} Analyzing ${targetUser.tag} in #${channel.name}`);
    
    // Fetch member to get roles
    let roles: string[] = [];
    try {
        const member = await channel.guild.members.fetch(targetUser.id);
        roles = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
    } catch (e) {
        console.log(`Could not fetch roles for ${targetUser.tag}`);
    }

    // Gather context
    const messages = await channel.messages.fetch({ limit: 50, before: triggerMessage.id });
    
    // Sort oldest to newest
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Format transcript
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    
    // Analyze
    const analysis = await analyzeContext(transcript, targetUser.tag, roles);
    
    if (!analysis) {
        console.error("Analysis failed.");
        return;
    }

    // Record the action for the dashboard (ALWAYS log for history)
    recordAction({
        timestamp: new Date().toISOString(),
        targetUser: targetUser.tag,
        targetRoles: roles,
        channel: channel.name,
        violation: analysis.violation,
        reason: analysis.shortReason,
        analysis: analysis.detailedAnalysis,
        socialProfile: analysis.socialProfile, // Pass profile
        type: analysis.violation ? 'INFRACTION' : 'NORMAL'
    });
    
    if (!analysis.violation) {
        console.log(`[Neural Profiling] Logged normal interaction for ${targetUser.tag}: ${analysis.socialProfile}`);
        return;
    }
    
    // Send to mod logs (Only for actual violations)
    const modLogsChannelId = process.env.MOD_LOGS_CHANNEL_ID;
    if (!modLogsChannelId) return;
    
    const modLogsChannel = await client.channels.fetch(modLogsChannelId);
    if (!modLogsChannel || !modLogsChannel.isTextBased()) return;
    
    const textChannel = modLogsChannel as TextChannel;
    
    const embed = new EmbedBuilder()
        .setTitle(`Potential Rule Violation: ${targetUser.tag}`)
        .setColor(0xff0000)
        .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'User Roles', value: roles.join(', ') || 'None', inline: true },
            { name: 'Behavior Profile', value: analysis.socialProfile },
            { name: 'Suggested Timeout', value: `${analysis.timeoutMinutes} minutes`, inline: true },
            { name: 'Short Reason', value: analysis.shortReason },
            { name: 'Detailed Analysis', value: analysis.detailedAnalysis }
        )
        .setTimestamp();
        
    const approveBtn = new ButtonBuilder()
        .setCustomId(`approve_timeout_${targetUser.id}_${analysis.timeoutMinutes}`)
        .setLabel(`Approve Timeout (${analysis.timeoutMinutes}m)`)
        .setStyle(ButtonStyle.Danger);
        
    const dismissBtn = new ButtonBuilder()
        .setCustomId(`dismiss_warning_${targetUser.id}`)
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary);
        
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(approveBtn, dismissBtn);
        
    await textChannel.send({ embeds: [embed], components: [row] });
}

interface ChannelCache {
    messages: Message[];
    lastId: string;
}

const massScanCache = new Map<string, ChannelCache>();

export async function performMassScan(channel: TextChannel): Promise<MassScanResult | null> {
    // Permission Check
    const permissions = channel.permissionsFor(client.user!);
    if (!permissions || !permissions.has('ViewChannel') || !permissions.has('ReadMessageHistory')) {
        console.error(`[Access] Missing permissions to scan #${channel.name}`);
        return null;
    }

    console.log(`Starting mass scan for channel: #${channel.name}`);
    
    let currentCache = massScanCache.get(channel.id);
    let allMessages: Message[] = [];
    
    if (currentCache) {
        console.log(`[Cache] Using ${currentCache.messages.length} cached messages for #${channel.name}`);
        
        // Fetch new messages since the last scan
        let newMessages: Message[] = [];
        let afterId = currentCache.lastId;
        
        while (true) {
            const fetched = await channel.messages.fetch({ limit: 100, after: afterId }) as unknown as Collection<string, Message>;
            if (fetched.size === 0) break;
            
            newMessages = newMessages.concat(Array.from(fetched.values()));
            afterId = fetched.first()?.id as string;
            
            if (newMessages.length >= 500) break; // Safety break
        }
        
        console.log(`[Cache] Found ${newMessages.length} new messages.`);
        
        // Combine and keep the latest 500
        allMessages = [...newMessages, ...currentCache.messages].slice(0, 500);
    } else {
        console.log(`[Cache] No cache found for #${channel.name}. Performing full fetch.`);
        
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
    
    // Sort oldest to newest for analysis
    const sorted = [...allMessages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Fetch roles for all unique authors in the transcript
    const uniqueAuthors = Array.from(new Set(sorted.map(m => m.author.id)));
    const rolesMap: Record<string, string[]> = {};
    
    for (const authorId of uniqueAuthors) {
        try {
            const member = await channel.guild.members.fetch(authorId);
            rolesMap[member.user.tag] = member.roles.cache.map(r => r.name).filter(n => n !== '@everyone');
        } catch (e) {
            // User might have left
        }
    }

    const rolesString = Object.entries(rolesMap).map(([tag, roles]) => `${tag}: [${roles.join(', ')}]`).join('\n');

    // Update cache with the latest state
    if (allMessages.length > 0) {
        const latestMsg = allMessages.reduce((prev, current) => 
            (prev.createdTimestamp > current.createdTimestamp) ? prev : current
        );
        
        massScanCache.set(channel.id, {
            messages: allMessages,
            lastId: latestMsg.id
        });
    }
    
    // Format transcript
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    
    // Perform AI Analysis
    const result = await analyzeMassScan(transcript, sorted.length, rolesString);
    
    if (result) {
        recordMassScan({
            timestamp: new Date().toISOString(),
            channel: channel.name,
            totalMessages: result.totalMessages,
            generalConclusion: result.generalConclusion,
            usersAnalyzed: result.usersAnalyzed
        });
    }
    
    return result;
}
