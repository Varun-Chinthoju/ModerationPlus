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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const discord_js_1 = require("discord.js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const commands = [
    {
        name: 'refresh-rules',
        description: 'Forces the bot to re-read the #rules channel',
    },
    {
        name: 'Analyze Context',
        type: discord_js_1.ApplicationCommandType.Message,
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
const rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
async function registerCommands(clientId) {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    }
    catch (error) {
        console.error('Error registering commands:', error);
    }
}
