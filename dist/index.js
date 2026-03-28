"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ai = exports.client = void 0;
const discord_js_1 = require("discord.js");
const genai_1 = require("@google/genai");
const dotenv = __importStar(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const rules_1 = require("./rules");
const moderation_1 = require("./moderation");
const register_1 = require("./register");
const stats_1 = require("./stats");
dotenv.config();
// Ensure required environment variables are set
if (!process.env.DISCORD_TOKEN)
    throw new Error("DISCORD_TOKEN is missing in .env");
if (!process.env.GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is missing in .env");
// Initialize Express for Dashboard API
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/stats', (req, res) => {
    const key = req.headers['x-api-key'];
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const isAuthorized = key === process.env.DASHBOARD_KEY;
    // Record the access attempt
    (0, stats_1.recordAccess)({
        timestamp: new Date().toISOString(),
        ip: Array.isArray(ip) ? ip[0] : ip,
        success: isAuthorized
    });
    if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json((0, stats_1.getStats)());
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Dashboard server running on port ${PORT}`));
// Initialize the Discord client
exports.client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildModeration,
        discord_js_1.GatewayIntentBits.GuildMembers,
    ],
    partials: [discord_js_1.Partials.Message, discord_js_1.Partials.Channel],
});
// Initialize the Gemini AI client
exports.ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
exports.client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    await (0, register_1.registerCommands)(readyClient.user.id);
    // Fetch rules on startup
    if (process.env.RULES_CHANNEL_ID) {
        await (0, rules_1.fetchRules)(process.env.RULES_CHANNEL_ID);
    }
});
exports.client.on(discord_js_1.Events.MessageCreate, async (message) => {
    // Ignore direct messages
    if (!message.guild || !message.channel.isTextBased())
        return;
    // Check if the message is from the trigger bot (e.g., Arcane)
    if (process.env.TRIGGER_BOT_ID && message.author.id === process.env.TRIGGER_BOT_ID) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
            await (0, moderation_1.handlePotentialInfraction)(message.channel, targetUser, message);
        }
    }
});
exports.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'refresh-rules') {
            if (!interaction.memberPermissions?.has('Administrator')) {
                await interaction.reply({ content: 'You do not have permission to use this.', ephemeral: true });
                return;
            }
            if (process.env.RULES_CHANNEL_ID) {
                await interaction.deferReply({ ephemeral: true });
                await (0, rules_1.fetchRules)(process.env.RULES_CHANNEL_ID);
                await interaction.editReply('Rules successfully refreshed!');
            }
            else {
                await interaction.reply({ content: 'RULES_CHANNEL_ID not set.', ephemeral: true });
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
                await (0, moderation_1.handlePotentialInfraction)(message.channel, message.author, message);
                await interaction.editReply('Analysis requested. Check the mod logs channel for results.');
            }
            else {
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
            if (!interaction.guild || !targetUserId || !timeoutMinutesStr)
                return;
            const timeoutMinutes = parseInt(timeoutMinutesStr, 10);
            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                if (member) {
                    await member.timeout(timeoutMinutes * 60 * 1000, `AI Moderation approved by ${interaction.user.tag}`);
                    (0, stats_1.recordTimeout)();
                    await interaction.update({ content: `Timeout of ${timeoutMinutes}m applied to <@${targetUserId}> by ${interaction.user.tag}.`, components: [] });
                }
                else {
                    await interaction.update({ content: `User not found in server.`, components: [] });
                }
            }
            catch (err) {
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
exports.client.login(process.env.DISCORD_TOKEN);
