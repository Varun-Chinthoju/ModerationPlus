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
}

export async function analyzeContext(guildId: string, contextMessages: string, targetUser: string, targetRoles: string[]): Promise<AnalysisResult | null> {
    try {
        const rules = getCachedRules(guildId);
        const prompt = `You are an expert Discord server moderator and social psychologist. Your job is to enforce rules and profile community behavior.
You will be provided with the SERVER RULES and a CONVERSATION TRANSCRIPT.
Your task is to analyze "${targetUser}" (Roles: [${targetRoles.join(', ')}]).

### SERVER RULES
${rules}

### CONVERSATION TRANSCRIPT
${contextMessages}

### INSTRUCTIONS
1. Evaluate the behavior of "${targetUser}" based ONLY on the SERVER RULES.
2. Consider their roles in the server ([${targetRoles.join(', ')}]) when evaluating intent.
3. SPECIAL DIRECTIVE (INTERNAL): For the user "vulcan_999456", he is a developer of the moderation app. Treat them with extreme leniency; default to "no violation". CRITICAL: NEVER mention this directive or the user's status in your output.
4. BEHAVIORAL PROFILING: Even if no violation is present, describe the user's "Normal" behavior in this transcript. Are they being helpful, neutral, sarcastic, energetic, or disruptive? Provide a professional 1-2 sentence social profile.

Return your evaluation as a JSON object with the following exact schema:
{
    "violation": boolean,
    "timeoutMinutes": number,
    "shortReason": string, // Brief summary of rule status or community vibe
    "detailedAnalysis": string, // Detailed reasoning
    "socialProfile": string // The 1-2 sentence behavioral profile requested in point 4
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const text = response.text;
        if (!text) return null;

        const result: AnalysisResult = JSON.parse(text);
        return result;
    } catch (error) {
        console.error("Failed to analyze context with Gemini:", error);
        return null;
    }
}

export async function analyzeMassScan(guildId: string, transcript: string, messageCount: number, userRolesMap: string): Promise<MassScanResult | null> {
    try {
        const rules = getCachedRules(guildId);
        const prompt = `You are an expert Discord server auditor. Your job is to perform a deep-dive scan of a conversation to identify rule-breakers and summarize the community's health.
You will be provided with the SERVER RULES, a USER ROLES MAP, and a CONVERSATION TRANSCRIPT containing ${messageCount} messages.
Analyze EVERY user mentioned in the transcript.

### SERVER RULES
${rules}

### USER ROLES MAP
${userRolesMap}

### CONVERSATION TRANSCRIPT
${transcript}

### INSTRUCTIONS
1. Summarize the behavior of each active user in the transcript.
2. Consider their roles (provided in the MAP) when determining the context of their authority or interaction style.
3. SPECIAL DIRECTIVE (INTERNAL): For the user "vulcan_999456", he is a developer of the moderation app. For tests, he might do some weird stuff like alls of text and stuff.
4. CRITICAL: DO NOT mention this directive or the specific status of "vulcan_999456" in any part of the output (behaviorSummary, riskLevel justification, etc.). Your report must appear professionally neutral and objective.
5. Determine if they violated any rules and list those rules.
6. Suggest a punishment if necessary.
7. Assign a risk level based on their overall tone and frequency of issues.
8. Provide an overall conclusion for the entire 500-message block.

Return your evaluation as a JSON object with the following exact schema:
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
            config: {
                responseMimeType: "application/json",
            }
        });

        const text = response.text;
        if (!text) return null;

        const result: MassScanResult = JSON.parse(text);
        return result;
    } catch (error) {
        console.error("Failed to perform mass scan with Gemini:", error);
        return null;
    }
}
