import { TextChannel, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User, Collection } from 'discord.js';
import { analyzeContext, analyzeMassScan, MassScanResult } from './ai';
import { client } from './index';
import { recordAction } from './stats';

export async function handlePotentialInfraction(channel: TextChannel, targetUser: User, triggerMessage: Message) {
    console.log(`Analyzing potential infraction by ${targetUser.tag} in #${channel.name}`);
    
    // Gather context
    const messages = await channel.messages.fetch({ limit: 50, before: triggerMessage.id });
    
    // Sort oldest to newest
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Format transcript
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    
    // Analyze
    const analysis = await analyzeContext(transcript, targetUser.tag);
    
    if (!analysis) {
        console.error("Analysis failed.");
        return;
    }

    // Record the action for the dashboard
    recordAction({
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
    if (!modLogsChannelId) return;
    
    const modLogsChannel = await client.channels.fetch(modLogsChannelId);
    if (!modLogsChannel || !modLogsChannel.isTextBased()) return;
    
    const textChannel = modLogsChannel as TextChannel;
    
    const embed = new EmbedBuilder()
        .setTitle(`Potential Rule Violation: ${targetUser.tag}`)
        .setColor(0xff0000)
        .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
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

export async function performMassScan(channel: TextChannel): Promise<MassScanResult | null> {
    console.log(`Starting mass scan for channel: #${channel.name}`);
    
    let allMessages: Message[] = [];
    let lastId: string | undefined;
    
    // Fetch 500 messages in chunks of 100
    for (let i = 0; i < 5; i++) {
        const options: any = { limit: 100 };
        if (lastId) options.before = lastId;
        
        const fetched = await channel.messages.fetch(options) as unknown as Collection<string, Message>;
        if (fetched.size === 0) break;
        
        allMessages = allMessages.concat(Array.from(fetched.values()));
        lastId = fetched.last()?.id;
    }
    
    // Sort oldest to newest
    const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Format transcript
    const transcript = sorted.map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    
    // Perform AI Analysis
    return await analyzeMassScan(transcript, sorted.length);
}
