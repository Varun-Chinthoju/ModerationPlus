import { REST, Routes, ApplicationCommandType } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'refresh-rules',
    description: 'Forces the bot to re-read the #rules channel',
  },
  {
    name: 'mass-scan',
    description: 'Audits the last 500 messages in this channel for community health',
  },
  {
    name: 'Analyze Context',
    type: ApplicationCommandType.Message,
  },
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
