import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const FLOWCHART_MODEL = "gemini-3.1-pro-preview";
const ANALYSIS_MODEL  = "gemini-2.5-flash";

// ── In-memory LRU cache ────────────────────────────────────────────────────
interface CacheEntry { data: any; ts: number; }
const CACHE_TTL  = 60 * 60 * 1000; // 1 hour
const CACHE_MAX  = 200;
const _cache     = new Map<string, CacheEntry>();

function cacheKey(...parts: string[]): string {
    return crypto.createHash("sha256").update(parts.join("::\x00::")).digest("hex");
}

function cacheGet(key: string): any | null {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
    return entry.data;
}

function cacheSet(key: string, data: any): void {
    if (_cache.size >= CACHE_MAX) {
        // evict the oldest entry
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { data, ts: Date.now() });
}

// ── Code pre-processor ─────────────────────────────────────────────────────
// Strips blank lines and comment-only lines so every character sent to the
// model is meaningful code. Falls back gracefully if the extension is unknown.
const COMMENT_PATTERNS: Record<string, RegExp> = {
    js:   /^\s*(\/\/|\/\*|\*)/,
    ts:   /^\s*(\/\/|\/\*|\*)/,
    jsx:  /^\s*(\/\/|\/\*|\*)/,
    tsx:  /^\s*(\/\/|\/\*|\*)/,
    java: /^\s*(\/\/|\/\*|\*)/,
    cs:   /^\s*(\/\/|\/\*|\*)/,
    go:   /^\s*\/\//,
    rs:   /^\s*(\/\/|\/\*|\*)/,
    cpp:  /^\s*(\/\/|\/\*|\*)/,
    c:    /^\s*(\/\/|\/\*|\*)/,
    py:   /^\s*#/,
    rb:   /^\s*#/,
    sh:   /^\s*#/,
    yaml: /^\s*#/,
    sql:  /^\s*--/,
    php:  /^\s*(\/\/|\/\*|\*|#)/,
};

function smartPreprocess(code: string, filename: string, maxChars: number): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const commentRe = COMMENT_PATTERNS[ext];

    const lines = code.split("\n");
    const meaningful: string[] = [];
    for (const line of lines) {
        if (line.trim() === "") continue;
        if (commentRe && commentRe.test(line)) continue;
        meaningful.push(line);
    }

    const compressed = meaningful.join("\n");

    // If compressed fits, use it directly
    if (compressed.length <= maxChars) return compressed;

    // Otherwise: first 70% + last 30% of the budget (keeps head + tail context)
    const headEnd = Math.floor(maxChars * 0.70);
    const tailStart = compressed.length - Math.floor(maxChars * 0.30);
    return compressed.substring(0, headEnd) + "\n// … (truncated) …\n" + compressed.substring(tailStart);
}

// ── GeminiService ──────────────────────────────────────────────────────────
export class GeminiService {
    private flowchartModel: any = null;
    private analysisModel: any  = null;

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
                        delayMs = retryDelay
                            ? parseInt(retryDelay) * 1000
                            : 10000 * (attempt + 1);
                    } else {
                        delayMs = 3000 * Math.pow(2, attempt);
                    }
                    console.warn(
                        `[Gemini] ${status} — retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})…`,
                    );
                    await new Promise((r) => setTimeout(r, delayMs));
                } else {
                    throw err;
                }
            }
        }
        throw new Error("Max retries exceeded.");
    }

    // ── Flowchart ─────────────────────────────────────────────────────────
    public async getCodeFlowchart(code: string, filename: string): Promise<string> {
        const key = cacheKey("flowchart", filename, code);
        const hit = cacheGet(key);
        if (hit) { console.log("[Cache] flowchart HIT"); return hit; }

        const snippet = smartPreprocess(code, filename, 6000);

        const prompt =
            `File: "${filename}". Output ONLY raw Mermaid starting with "flowchart TD" — no explanation, no fences.\n` +
            `Show functions, classes, key control flow (if/else, loops, try/catch) with real names. Aim 8-20 nodes.\n\n` +
            `CODE:\n${snippet}`;

        let text = (await this.callWithRetry(this.getFlowchartModel(), prompt)).trim();
        text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
        if (!text.startsWith("flowchart") && !text.startsWith("graph")) {
            text = "flowchart TD\n" + text;
        }

        cacheSet(key, text);
        return text;
    }

    // ── AI Code Analysis ──────────────────────────────────────────────────
    public async analyzeCode(code: string, filename: string): Promise<any> {
        const key = cacheKey("analyze", filename, code);
        const hit = cacheGet(key);
        if (hit) { console.log("[Cache] analyzeCode HIT"); return hit; }

        // Up to 6 000 meaningful characters (2.5× richer context vs old 2 500)
        const snippet = smartPreprocess(code, filename, 6000);

        const prompt =
            `You are a senior engineer. Analyze the file "${filename}" below.\n` +
            `Reply with ONLY a valid JSON object — no markdown, no fences:\n` +
            `{"summary":"one sentence","purpose":"one sentence","keyInsights":["a","b","c"],"suggestions":["x","y"],"patterns":["p1","p2"]}\n\n` +
            `CODE:\n${snippet}`;

        const raw = (await this.callWithRetry(this.getAnalysisModel(), prompt)).trim();

        const start = raw.indexOf("{");
        const end   = raw.lastIndexOf("}");
        if (start === -1 || end === -1) {
            console.error("[Gemini] analyzeCode unexpected response:", raw.substring(0, 300));
            throw new Error("AI returned an unexpected format. Try again.");
        }
        let parsed: any;
        try {
            parsed = JSON.parse(raw.substring(start, end + 1));
        } catch (parseErr) {
            console.error("[Gemini] JSON parse error:", parseErr, "\nRaw:", raw.substring(0, 300));
            throw new Error("AI response could not be parsed. Try again.");
        }

        cacheSet(key, parsed);
        return parsed;
    }

    // ── Architectural Analysis ─────────────────────────────────────────────
    public async getArchitecturalAnalysis(context: string): Promise<any> {
        const key = cacheKey("arch", context);
        const hit = cacheGet(key);
        if (hit) { console.log("[Cache] architecturalAnalysis HIT"); return hit; }

        const prompt =
            `Analyze this project file structure. Reply with ONLY a JSON object with keys "summary" and "mermaidDiagram".\n\n` +
            context;

        const text  = await this.callWithRetry(this.getFlowchartModel(), prompt);
        const start = text.indexOf("{");
        const end   = text.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("Invalid architectural analysis response.");
        const parsed = JSON.parse(text.substring(start, end + 1));

        cacheSet(key, parsed);
        return parsed;
    }
}
