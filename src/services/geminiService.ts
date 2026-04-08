// FILE: ai-code-visualizer/src/services/geminiService.ts

import { GoogleGenerativeAI } from "@google/generative-ai";

const FLOWCHART_MODEL = "gemini-3.1-pro-preview";  // GENERATIVE_AI_API_KEY (paid tier)
const ANALYSIS_MODEL  = "gemini-2.5-flash"; // GEMINI_API_KEY (free tier)

export class GeminiService {
    // Lazy-initialized — one instance per API key
    private flowchartModel: any = null;
    private analysisModel: any = null;

    private getFlowchartModel(): any {
        if (!this.flowchartModel) {
            const key = process.env.GENERATIVE_AI_API_KEY;
            if (!key) throw new Error("GENERATIVE_AI_API_KEY is not set.");
            this.flowchartModel = new GoogleGenerativeAI(key)
                .getGenerativeModel({ model: FLOWCHART_MODEL });
        }
        return this.flowchartModel;
    }

    private getAnalysisModel(): any {
        if (!this.analysisModel) {
            const key = process.env.GEMINI_API_KEY;
            if (!key) throw new Error("GEMINI_API_KEY is not set.");
            this.analysisModel = new GoogleGenerativeAI(key)
                .getGenerativeModel({ model: ANALYSIS_MODEL });
        }
        return this.analysisModel;
    }

    private async callWithRetry(
        model: any,
        prompt: string,
        maxRetries = 3,
    ): Promise<string> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await model.generateContent(prompt);
                return result.response.text();
            } catch (err: any) {
                const status = err?.status as number | undefined;
                const isRetryable = status === 429 || status === 503 || status === 500;

                if (isRetryable && attempt < maxRetries) {
                    let delayMs: number;
                    if (status === 429) {
                        const retryDelay = err?.errorDetails?.find((d: any) =>
                            d["@type"]?.includes("RetryInfo"),
                        )?.retryDelay;
                        delayMs = retryDelay ? parseInt(retryDelay) * 1000 : 10000 * (attempt + 1);
                    } else {
                        // 503/500: short exponential backoff (3s, 6s, 12s)
                        delayMs = 3000 * Math.pow(2, attempt);
                    }
                    console.warn(
                        `[Gemini] ${status} error. Retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})…`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                } else {
                    throw err;
                }
            }
        }
        throw new Error("Max retries exceeded.");
    }

    // ── Flowchart (GENERATIVE_AI_API_KEY) ───────────────────────
    public async getCodeFlowchart(code: string, filename: string): Promise<string> {
        const snippet = code.substring(0, 5000);
        const prompt = `You are an expert code analyst. Analyze the file "${filename}" and produce a Mermaid.js flowchart.
Rules:
- Use "flowchart TD" syntax only.
- Show functions, classes, key control flow (if/else, loops, try/catch), and return paths with real names from the code.
- Aim for 8–20 nodes. No explanation, no markdown fences — output ONLY raw Mermaid starting with "flowchart TD".

CODE:
\`\`\`
${snippet}
\`\`\``;

        let text = (await this.callWithRetry(this.getFlowchartModel(), prompt)).trim();
        text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
        if (!text.startsWith("flowchart") && !text.startsWith("graph")) {
            text = "flowchart TD\n" + text;
        }
        return text;
    }

    // ── AI Code Analysis (GEMINI_API_KEY) ───────────────────────
    // Code is capped at 2 500 chars to avoid burning quota.
    public async analyzeCode(code: string, filename: string): Promise<any> {
        // Smart truncation: first 2000 + last 500 chars keeps context and tail
        const MAX = 2500;
        const snippet =
            code.length <= MAX
                ? code
                : code.substring(0, 2000) + "\n…\n" + code.substring(code.length - 500);

        const prompt = `Analyze this code file as a senior engineer. Reply with ONLY a JSON object — no markdown, no code fences.

File: ${filename}
\`\`\`
${snippet}
\`\`\`

JSON structure (use double quotes, valid JSON):
{"summary":"one sentence","purpose":"one sentence","keyInsights":["a","b","c"],"suggestions":["x","y"],"patterns":["p1","p2"]}`;

        const raw = (await this.callWithRetry(this.getAnalysisModel(), prompt)).trim();

        // Robust JSON extraction
        const start = raw.indexOf("{");
        const end   = raw.lastIndexOf("}");
        if (start === -1 || end === -1) {
            console.error("[Gemini] analyzeCode raw response:", raw.substring(0, 300));
            throw new Error("AI returned an unexpected format. Try again.");
        }
        try {
            return JSON.parse(raw.substring(start, end + 1));
        } catch (parseErr) {
            console.error("[Gemini] JSON parse error:", parseErr, "\nRaw:", raw.substring(0, 300));
            throw new Error("AI response could not be parsed. Try again.");
        }
    }

    // ── Architectural analysis (GENERATIVE_AI_API_KEY) ──────────
    public async getArchitecturalAnalysis(context: string): Promise<any> {
        const prompt = `Analyze this project file structure and reply with ONLY a JSON object with keys "summary" and "mermaidDiagram".

${context}`;
        const text = await this.callWithRetry(this.getFlowchartModel(), prompt);
        const start = text.indexOf("{");
        const end   = text.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("Invalid architectural analysis response.");
        return JSON.parse(text.substring(start, end + 1));
    }
}
