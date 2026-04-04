import { ai } from './index';
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
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface MassScanResult {
    totalMessages: number;
    usersAnalyzed: UserSummary[];
    generalConclusion: string;
}

export async function analyzeContext(guildId: string, transcript: string, targetUser: string): Promise<AnalysisResult | null> {
    try {
        const prompt = `You are an expert Discord server moderator. Your job is to enforce the server rules fairly but strictly.
You will be provided with the SERVER RULES and a CONVERSATION TRANSCRIPT.
A potential infraction was detected regarding the user "${targetUser}".
Your task is to analyze the context of the transcript to determine if "${targetUser}" actually violated the rules.

### SERVER RULES
${cachedRules}

### CONVERSATION TRANSCRIPT
${transcript}

### INSTRUCTIONS
Evaluate the behavior of "${targetUser}" based ONLY on the SERVER RULES.
Return your evaluation as a JSON object with the following exact schema:
{
    "violation": boolean, // true if they broke a rule, false otherwise
    "timeoutMinutes": number, // suggested timeout duration in minutes (0 if no violation)
    "shortReason": string, // A very brief 1-sentence reason for the violation (or lack thereof)
    "detailedAnalysis": string // A detailed explanation referencing the specific rule broken and why the context proves it.
}`;

        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Clean markdown if present
        const jsonStr = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Failed to analyze context with Gemini:", error);
        return null;
    }
}

export async function analyzeMassScan(transcript: string, count: number): Promise<MassScanResult | null> {
    try {
        const prompt = `You are an expert Discord community analyst. 
Analyze the following transcript of ${count} messages to provide a "Community Health Audit".
Identify key active users and provide a brief summary of their behavior and a risk level (Low, Medium, High, Critical).
Finally, provide a general conclusion about the server's current atmosphere.

### CONVERSATION TRANSCRIPT
${transcript}

### INSTRUCTIONS
Return your evaluation as a JSON object with the following exact schema:
{
    "totalMessages": number,
    "usersAnalyzed": [
        {
            "userTag": "string",
            "behaviorSummary": "one sentence summary",
            "riskLevel": "Low|Medium|High|Critical"
        }
    ],
    "generalConclusion": "A detailed executive summary of the community state."
}`;

        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonStr = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Failed to perform AI Mass Scan:", error);
        return null;
    }
}
