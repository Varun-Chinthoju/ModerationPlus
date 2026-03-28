"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeContext = analyzeContext;
const index_1 = require("./index");
const rules_1 = require("./rules");
async function analyzeContext(contextMessages, targetUser) {
    try {
        const prompt = `You are an expert Discord server moderator. Your job is to enforce the server rules fairly but strictly.
You will be provided with the SERVER RULES and a CONVERSATION TRANSCRIPT.
A potential infraction was detected regarding the user "${targetUser}".
Your task is to analyze the context of the transcript to determine if "${targetUser}" actually violated the rules.

### SERVER RULES
${rules_1.cachedRules}

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
        const response = await index_1.ai.models.generateContent({
            model: 'gemini-1.5-flash',
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
