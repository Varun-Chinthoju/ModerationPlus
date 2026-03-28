export interface AnalysisResult {
    violation: boolean;
    timeoutMinutes: number;
    shortReason: string;
    detailedAnalysis: string;
}
export declare function analyzeContext(contextMessages: string, targetUser: string): Promise<AnalysisResult | null>;
//# sourceMappingURL=ai.d.ts.map