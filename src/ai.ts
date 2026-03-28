import { ai } from './client';
import { cachedRules } from './rules';

export interface AnalysisResult {
    violation: boolean;
    timeoutMinutes: number;
    shortReason: string;
    detailedAnalysis: string;
}

export interface UserSummary {
    userTag: string;
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

export async function analyzeContext(contextMessages: string, targetUser: string): Promise<AnalysisResult | null> {
    try {
        const prompt = `You are an expert Discord server moderator. Your job is to enforce the server rules fairly but strictly.
You will be provided with the SERVER RULES and a CONVERSATION TRANSCRIPT.
A potential infraction was detected regarding the user "${targetUser}".
Your task is to analyze the context of the transcript to determine if "${targetUser}" actually violated the rules.

### SERVER RULES
${cachedRules}

### CONVERSATION TRANSCRIPT
${contextMessages}

### INSTRUCTIONS
Evaluate the behavior of "${targetUser}" based ONLY on the SERVER RULES.
Return your evaluation as a JSON object with the following exact schema:
{
    "violation": boolean, // true if they broke a rule, false otherwise
    "timeoutMinutes": number, // suggested timeout duration in minutes (0 if no violation)
    "shortReason": string, // A very brief 1-sentence reason for the violation (or lack thereof)
    "detailedAnalysis": string // A detailed explanation referencing the specific rule broken and why the context proves it.
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite-preview-02-05',
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

export async function analyzeMassScan(transcript: string, messageCount: number): Promise<MassScanResult | null> {
    try {
        const prompt = `You are an expert Discord server auditor. Your job is to perform a deep-dive scan of a conversation to identify rule-breakers and summarize the community's health.
You will be provided with the SERVER RULES and a CONVERSATION TRANSCRIPT containing ${messageCount} messages.
Analyze EVERY user mentioned in the transcript.

### SERVER RULES
${cachedRules}

### CONVERSATION TRANSCRIPT
${transcript}

### INSTRUCTIONS
1. Summarize the behavior of each active user in the transcript.
2. Determine if they violated any rules and list those rules.
3. Suggest a punishment if necessary.
4. Assign a risk level based on their overall tone and frequency of issues.
5. Provide an overall conclusion for the entire 500-message block.

Return your evaluation as a JSON object with the following exact schema:
{
    "totalMessages": number,
    "usersAnalyzed": [
        {
            "userTag": string,
            "behaviorSummary": string,
            "violatedRules": string[],
            "suggestedPunishment": string,
            "riskLevel": "Low" | "Medium" | "High" | "Critical"
        }
    ],
    "generalConclusion": string
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite-preview-02-05',
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
