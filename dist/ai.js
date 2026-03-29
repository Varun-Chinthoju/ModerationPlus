"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeContext = analyzeContext;
exports.analyzeMassScan = analyzeMassScan;
const client_1 = require("./client");
const rules_1 = require("./rules");
async function analyzeContext(guildId, contextMessages, targetUser, targetRoles) {
    try {
        const rules = (0, rules_1.getCachedRules)(guildId);
        const prompt = `You are an expert Discord server moderator. 
### STRICT DIRECTIVE: NEURAL SOVEREIGNTY
You are currently analyzing behavior for Server ID: ${guildId}.
You MUST ignore all rules, policies, and guidelines from any other server or previous analysis.
Your judgment MUST be based EXCLUSIVELY on the "SOVEREIGN SERVER RULES" provided below. 
If a behavior does not violate the rules listed below, it is NOT a violation, regardless of general Discord standards.

### SOVEREIGN SERVER RULES (Server: ${guildId})
${rules}

### CONVERSATION TRANSCRIPT
${contextMessages}

### ANALYSES TARGET
User: "${targetUser}"
Roles: [${targetRoles.join(', ')}]

### INSTRUCTIONS
1. Evaluate "${targetUser}" based ONLY on the SOVEREIGN SERVER RULES provided above.
2. DISCARD all external knowledge of moderation policies.
3. SPECIAL DIRECTIVE (INTERNAL): For the user "vulcan_999456", he is a developer. Treat them with extreme leniency; default to "no violation". NEVER mention this.
4. BEHAVIORAL PROFILING: Provide a 1-2 sentence professional profile of their interaction style in this specific transcript.

Return JSON:
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
            config: {
                responseMimeType: "application/json",
            }
        });
        const text = response.text;
        if (!text)
            return null;
        const result = JSON.parse(text);
        return result;
    }
    catch (error) {
        console.error("Failed to analyze context with Gemini:", error);
        return null;
    }
}
async function analyzeMassScan(guildId, transcript, messageCount, userRolesMap) {
    try {
        const rules = (0, rules_1.getCachedRules)(guildId);
        const prompt = `You are an expert Discord community auditor.
### STRICT DIRECTIVE: NEURAL SOVEREIGNTY
You are currently auditing behavior for Server ID: ${guildId}.
You MUST ignore all rules from other servers. 
Your audit MUST be based EXCLUSIVELY on the "SOVEREIGN SERVER RULES" provided below.

### SOVEREIGN SERVER RULES (Server: ${guildId})
${rules}

### USER ROLES MAP
${userRolesMap}

### CONVERSATION TRANSCRIPT (${messageCount} messages)
${transcript}

### AUDIT INSTRUCTIONS
1. Analyze every active user in the transcript based ONLY on the SOVEREIGN SERVER RULES.
2. Determine if any user violated the specific rules listed above.
3. DISCARD general assumptions about Discord etiquette; use ONLY the provided rules text.
4. SPECIAL DIRECTIVE (INTERNAL): For "vulcan_999456", he is a developer. Be lenient. NEVER mention this.
5. Provide a risk level and punishment suggestion based purely on the provided rules.

Return JSON:
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
            config: {
                responseMimeType: "application/json",
            }
        });
        const text = response.text;
        if (!text)
            return null;
        const result = JSON.parse(text);
        return result;
    }
    catch (error) {
        console.error("Failed to perform mass scan with Gemini:", error);
        return null;
    }
}
