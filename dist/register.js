"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const discord_js_1 = require("discord.js");
async function registerCommands(clientId) {
    const commands = [
        new discord_js_1.SlashCommandBuilder()
            .setName('setup')
            .setDescription('Configure neural moderation settings for this server')
            .addChannelOption(option => option.setName('rules-channel')
            .setDescription('The channel containing your server rules text')
            .setRequired(true))
            .addChannelOption(option => option.setName('log-channel')
            .setDescription('Where the AI should post potential violations for review')
            .setRequired(true))
            .addStringOption(option => option.setName('trigger-bot')
            .setDescription('The ID of another bot whose messages trigger AI checks (optional)')),
        new discord_js_1.SlashCommandBuilder()
            .setName('dashboard-key')
            .setDescription('Set or update your private Neural Access Key for the web dashboard')
            .addStringOption(option => option.setName('key')
            .setDescription('Your secret password for the dashboard')
            .setRequired(true)),
        new discord_js_1.SlashCommandBuilder()
            .setName('config')
            .setDescription('Update server-specific moderation parameters')
            .addIntegerOption(option => option.setName('audit-interval')
            .setDescription('Automatically run a neural community audit every X messages (default: 100)'))
            .addIntegerOption(option => option.setName('default-timeout')
            .setDescription('Default duration for dashboard timeouts in minutes (default: 10)')
            .setMinValue(1)
            .setMaxValue(40320)), // 1 week max
        new discord_js_1.SlashCommandBuilder()
            .setName('refresh-rules')
            .setDescription('Manually force the AI to re-read your rules channel'),
        new discord_js_1.ContextMenuCommandBuilder()
            .setName('Analyze Context')
            .setType(discord_js_1.ApplicationCommandType.Message)
    ].map(command => command.toJSON());
    const rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log(`Started refreshing application (/) commands.`);
        await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commands });
        console.log(`Successfully reloaded application (/) commands.`);
    }
    catch (error) {
        console.error(error);
    }
}
