import { TextChannel, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User } from 'discord.js';
import { analyzeContext } from './ai';
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
    const analysis = await analyzeContext(channel.guild.id, transcript, targetUser.tag);
    
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
    
    try {
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
    } catch (e) {
        console.error(`Failed to send to mod logs:`, e);
    }
}
