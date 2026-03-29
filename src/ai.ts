import { ai } from './client';
import { getCachedRules } from './rules';

export interface AnalysisResult {
    violation: boolean;
    timeoutMinutes: number;
    shortReason: string;
    detailedAnalysis: string;
    socialProfile: string;
}

export interface UserSummary {
    userTag: string;
    userRoles: string[];
    behaviorSummary: string;
    violatedRules: string[];
    suggestedPunishment: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface MassScanResult {
    totalMessages: number;
    usersAnalyzed: UserSummary[];
    generalConclusion: string;
    timestamp?: string; // For dashboard history
    channel?: string;
}

// Helper to extract JSON from AI response if it contains markdown or extra text
function extractJson(text: string) {
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 100)}...`);
    }
}

export async function analyzeContext(guildId: string, contextMessages: string, targetUser: string, targetRoles: string[]): Promise<AnalysisResult | null> {
    try {
        const rules = getCachedRules(guildId);
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

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        if (!response.text) return null;
        return extractJson(response.text);
    } catch (error) {
        console.error("AI Context Analysis Failed:", error);
        return null;
    }
}

export async function analyzeMassScan(guildId: string, transcript: string, messageCount: number, userRolesMap: string): Promise<MassScanResult | null> {
    try {
        const rules = getCachedRules(guildId);
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

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        if (!response.text) return null;
        return extractJson(response.text);
    } catch (error) {
        console.error("AI Mass Scan Failed:", error);
        return null;
    }
}
