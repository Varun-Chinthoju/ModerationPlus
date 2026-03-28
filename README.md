# Discord AI Moderation Bot (Gemini Engine)

An intelligent, context-aware Discord moderation bot powered by Google's Gemini AI. This bot moves beyond simple keyword filters by understanding the flow of a conversation and applying server-specific rules to determine if a timeout is necessary.

## 🚀 Features

-   **Contextual Analysis**: Uses Gemini-1.5-Flash to analyze up to 50 messages of conversation history to understand the nuance of potential infractions.
-   **Token Efficiency**: Only queries Gemini when triggered by a standard moderation bot (e.g., Arcane) or via a manual moderator command, saving on API costs.
-   **Dynamic Rules Ingestion**: Reads your server's `#rules` channel on startup. Update your rules in Discord, run `/refresh-rules`, and the AI's "brain" is instantly updated.
-   **Human-in-the-loop UI**: AI findings are sent to a private `#mod-logs` channel with detailed reasoning and interactive buttons (**Approve Timeout**, **Dismiss**) so moderators have the final say.
-   **On-Demand Review**: Right-click any message -> **Apps** -> **Analyze Context** to manually trigger an AI evaluation of any situation.

## 🛠️ Tech Stack

-   **Node.js & TypeScript**
-   **discord.js v14**
-   **@google/genai** (Google Gemini API)
-   **dotenv**

## ⚙️ Setup Instructions

### 1. Prerequisites
-   [Node.js](https://nodejs.org/) (v16.11.0 or higher)
-   A [Google AI Studio API Key](https://aistudio.google.com/)
-   A [Discord Bot Token](https://discord.com/developers/applications)

### 2. Discord Developer Portal Configuration
Enable the following **Privileged Gateway Intents** for your bot:
-   `Presence Intent`
-   `Server Members Intent`
-   `Message Content Intent`

### 3. Installation
1.  Clone the repository and enter the directory.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory:
    ```env
    DISCORD_TOKEN=your_discord_token
    GEMINI_API_KEY=your_gemini_api_key
    RULES_CHANNEL_ID=your_rules_channel_id
    MOD_LOGS_CHANNEL_ID=your_mod_logs_channel_id
    TRIGGER_BOT_ID=437808476106784770 # Default for Arcane
    ```

### 4. Running the Bot
```bash
# Development mode (auto-reloads)
npm run dev

# Build and start
npm run build
npm start
```

## 📜 Commands

-   `/refresh-rules`: (Admin only) Forces the bot to re-read and cache the content of your `#rules` channel.
-   **Analyze Context**: (Context Menu) Right-click any message to have Gemini evaluate the surrounding conversation.

## 🛡️ Moderation Workflow

1.  **Trigger**: A standard bot (like Arcane) issues a warning or a moderator manually triggers the analysis.
2.  **Context Capture**: The bot grabs the last 50 messages from the channel.
3.  **AI Analysis**: Gemini evaluates the transcript against the cached server rules.
4.  **Review**: A report is sent to the `#mod-logs` channel.
5.  **Action**: A moderator clicks **Approve** to apply the suggested timeout or **Dismiss** to ignore the warning.

---
*Created with Gemini CLI*
