# Discord Moderation Bot (Gemini AI Contextual Engine)

## Background & Motivation
Standard Discord moderation bots (like Arcane) are great for basic word filters and spam detection, but they lack the ability to understand context. Relying purely on an LLM to scan every message is too expensive (token burn). The goal is to build a hybrid solution: a bot that uses standard tools to detect *potential* infractions, and then leverages Gemini to analyze the context and apply nuanced moderation based on the server's specific rules.

## Scope & Impact
- **Language/Stack**: Node.js, TypeScript, `discord.js` v14, `@google/genai`
- **Dynamic Rules**: The bot will dynamically build its system prompt by reading the server's `#rules` channel.
- **Trigger-Based Analysis**: To save tokens, the bot will only consult Gemini when a warning is issued by another bot (e.g., Arcane) or via Discord's built-in AutoMod.
- **Moderator UI**: The bot will use Discord's interactive components (Buttons, Modals, and Context Menus) so moderators can easily review AI decisions, manually request analysis, and override actions.

## Proposed Solution
1. **Initialization**: On startup, the bot fetches all messages from a configured `#rules` channel and stores them in memory.
2. **Event Listening**: The bot listens for `messageCreate` events. It checks if the message author is the Arcane bot (or matches a specific warning format).
3. **Context Gathering**: Once a trigger is detected, the bot fetches the last 50 messages from that channel.
4. **AI Evaluation**: The bot sends the 50-message context and the cached rules to Gemini.
5. **Interactive Action & Detailed Analysis**: If Gemini indicates a violation, the bot sends a detailed, formatted analysis report to `#mod-logs`. This embed includes Discord **Buttons** (e.g., `[Apply Timeout]`, `[Dismiss]`, `[Ban]`) allowing moderators to easily approve or reject the AI's recommendation.
6. **Manual Trigger (Context Menu)**: Moderators can Right-Click any message -> Apps -> "Analyze with AI" to force a context check without waiting for an Arcane trigger.

## Alternatives Considered
- **Scanning Every Message**: Rejected due to high API cost and token burn.
- **Fully Autonomous Timeouts**: Rejected in favor of a "human-in-the-loop" UI approach via Discord Buttons to ensure mods have final say.

## Implementation Plan

- [ ] **Step 1: Project Setup**
  - Initialize Node.js project (`npm init -y`).
  - Install dependencies (`discord.js`, `typescript`, `ts-node`, `dotenv`, `@google/genai`).
  - Configure `tsconfig.json`.
- [ ] **Step 2: Bot Core & Authentication**
  - Create the main entry point (`src/index.ts`).
  - Set up Discord client with necessary intents and component listeners.
  - Connect to Gemini API using the new `@google/genai` SDK.
- [ ] **Step 3: Dynamic Rules Ingestion**
  - Create a function to fetch and concatenate messages from `#rules`.
  - Implement a `/refresh-rules` slash command.
- [ ] **Step 4: Trigger Detection & Context Gathering**
  - Listen to `messageCreate` for Arcane warnings.
  - Fetch the last 50-100 messages from the channel for context.
- [ ] **Step 5: Gemini AI Analysis**
  - Construct the prompt containing rules and transcripts.
  - Ask Gemini to output JSON (`violation`, `timeoutMinutes`, `shortReason`, `detailedAnalysis`).
- [ ] **Step 6: Moderator UI (Embeds & Buttons)**
  - Construct a rich Discord Embed containing the `detailedAnalysis`.
  - Add `ActionRowBuilder` with Buttons: `Approve Timeout`, `Dismiss Warning`, `Custom Action`.
  - Send to `#mod-logs`.
  - Implement an `interactionCreate` listener to handle the button clicks and apply the actual Discord timeout.
- [ ] **Step 7: Manual Analysis (Context Menu)**
  - Register a Message Context Menu command: "Analyze Context".
  - When a mod uses it, fetch the surrounding 50 messages and run the Gemini evaluation directly, returning an ephemeral interactive UI to the mod.

## Verification
- Run the bot in a test server.
- Verify the interactive UI buttons work and correctly apply Discord timeouts.
- Verify the Right-Click Context Menu command works correctly.
- Verify token usage is only incurred on triggers.

## Migration & Rollback
- If the AI makes incorrect judgments, the "human-in-the-loop" button design prevents immediate harm.
- Adjusting the AI's strictness can be done by simply editing the `#rules` channel and running `/refresh-rules`.
