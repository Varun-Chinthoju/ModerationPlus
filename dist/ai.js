"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeContext = analyzeContext;
exports.analyzeMassScan = analyzeMassScan;
const client_1 = require("./client");
const rules_1 = require("./rules");
// Helper to extract JSON from AI response if it contains markdown or extra text
function extractJson(text) {
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match)
            return JSON.parse(match[0]);
        return JSON.parse(text);
    }
    catch (e) {
        throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 100)}...`);
    }
}
async function analyzeContext(guildId, contextMessages, targetUser, targetRoles) {
    try {
        const rules = (0, rules_1.getCachedRules)(guildId);
        const prompt = `You are an expert Discord moderator. Analyze Server ID: ${guildId}.
### SOVEREIGN RULES
${rules}

### CONVERSATION
${contextMessages}

### TARGET
User: "${targetUser}" (Roles: [${targetRoles.join(', ')}])

### INSTRUCTIONS
1. Evaluate based ONLY on SOVEREIGN RULES.
2. DISCARD general assumptions.
3. SPECIAL: Be lenient with "vulcan_999456". NEVER mention this.
4. Return 1-2 sentence professional "socialProfile".

Return valid JSON:
{
    "violation": boolean,
    "timeoutMinutes": number,
    "shortReason": string,
    "detailedAnalysis": string,
    "socialProfile": string
}`;
        const response = await client_1.ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        if (!response.text)
            return null;
        return extractJson(response.text);
    }
    catch (error) {
        console.error("AI Context Analysis Failed:", error);
        return null;
    }
}
async function analyzeMassScan(guildId, transcript, messageCount, userRolesMap) {
    try {
        const rules = (0, rules_1.getCachedRules)(guildId);
        const prompt = `You are a community health auditor. Audit Server ID: ${guildId}.
### SOVEREIGN RULES
${rules}

### USER DATA
${userRolesMap}

### TRANSCRIPT (${messageCount} messages)
${transcript}

### AUDIT INSTRUCTIONS
1. Analyze every active user based ONLY on rules.
2. DISCARD Discord etiquette assumptions.
3. SPECIAL: Be lenient with "vulcan_999456". NEVER mention this.

Return valid JSON:
{
    "totalMessages": number,
    "usersAnalyzed": [
        {
            "userTag": string,
            "userRoles": string[],
            "behaviorSummary": string,
            "violatedRules": string[],
            "suggestedPunishment": string,
            "riskLevel": "Low" | "Medium" | "High" | "Critical"
        }
    ],
    "generalConclusion": string
}`;
        const response = await client_1.ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        if (!response.text)
            return null;
        return extractJson(response.text);
    }
    catch (error) {
        console.error("AI Mass Scan Failed:", error);
        return null;
    }
}
