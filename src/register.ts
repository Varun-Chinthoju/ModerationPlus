import { REST, Routes, ApplicationCommandType } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'refresh-rules',
    description: 'Forces the bot to re-read the #rules channel',
  },
  {
    name: 'Analyze Context',
    type: ApplicationCommandType.Message,
  },
  {
    name: 'setup',
    description: 'Configure Moderation++ for this server',
    options: [
        {
            name: 'rules-channel',
            description: 'The channel containing your server rules',
            type: 7, // Channel
            required: true
        },
        {
            name: 'log-channel',
            description: 'Where the AI should post potential violations',
            type: 7, // Channel
            required: true
        },
        {
            name: 'trigger-bot',
            description: 'The ID of the bot that triggers scans (optional)',
            type: 3 // String
        }
    ]
  },
  {
    name: 'dashboard-key',
    description: 'Set the secret key required to access your web dashboard',
    options: [
        {
            name: 'key',
            description: 'A secret password for your dashboard',
            type: 3, // String
            required: true
        }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

export async function registerCommands(clientId: string) {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}
