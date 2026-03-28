import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is missing in .env");
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in .env");

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

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
