import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export async function registerCommands(clientId: string) {
    const commands = [
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('Configure neural moderation settings for this server')
            .addChannelOption(option => 
                option.setName('rules-channel')
                    .setDescription('The channel containing your server rules text')
                    .setRequired(true))
            .addChannelOption(option => 
                option.setName('log-channel')
                    .setDescription('Where the AI should post potential violations for review')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('trigger-bot')
                    .setDescription('The ID of another bot whose messages trigger AI checks (optional)')),
        
        new SlashCommandBuilder()
            .setName('dashboard-key')
            .setDescription('Set or update your private Neural Access Key for the web dashboard')
            .addStringOption(option => 
                option.setName('key')
                    .setDescription('Your secret password for the dashboard')
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('config')
            .setDescription('Update server-specific moderation parameters')
            .addIntegerOption(option => 
                option.setName('audit-interval')
                    .setDescription('Automatically run a neural community audit every X messages (default: 100)'))
            .addIntegerOption(option => 
                option.setName('default-timeout')
                    .setDescription('Default duration for dashboard timeouts in minutes (default: 10)')
                    .setMinValue(1)
                    .setMaxValue(40320)), // 1 week max

        new SlashCommandBuilder()
            .setName('refresh-rules')
            .setDescription('Manually force the AI to re-read your rules channel'),

        new ContextMenuCommandBuilder()
            .setName('Analyze Context')
            .setType(ApplicationCommandType.Message)
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    try {
        console.log(`Started refreshing application (/) commands.`);
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`Successfully reloaded application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
}
