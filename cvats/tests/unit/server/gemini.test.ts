import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GenerativeModel } from "@google/generative-ai";
import {
  analyzeWithGemini,
  GeminiQuotaError,
  getGeminiCache,
  setGeminiCache,
  resetGeminiState,
} from "@/server/analysis/gemini";

const summaryResponses: string[] = [];
const analysisResponses: string[] = [];
let lastAnalysisPrompt: string | null = null;

const summaryModel: GenerativeModel = {
  generateContent: vi.fn(async () => ({
    response: { text: () => summaryResponses.shift() ?? "" },
  })),
} as unknown as GenerativeModel;

const analysisModel: GenerativeModel = {
  generateContent: vi.fn(async ({ contents }) => {
    const part = contents?.[0]?.parts?.[0];
    lastAnalysisPrompt = typeof part?.text === "string" ? part.text : null;
    return { response: { text: () => analysisResponses.shift() ?? "" } };
  }),
} as unknown as GenerativeModel;

const getGenerativeModelMock = vi.fn((options?: { systemInstruction?: string }) => {
  return options?.systemInstruction ? analysisModel : summaryModel;
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    getGenerativeModel = getGenerativeModelMock;
  },
}));

describe("analyzeWithGemini", () => {
  beforeEach(() => {
    summaryResponses.length = 0;
    analysisResponses.length = 0;
    lastAnalysisPrompt = null;
    (summaryModel.generateContent as unknown as Mock).mockReset();
    (analysisModel.generateContent as unknown as Mock).mockReset();
    (summaryModel.generateContent as unknown as Mock).mockImplementation(async () => ({
      response: { text: () => summaryResponses.shift() ?? "" },
    }));
    (analysisModel.generateContent as unknown as Mock).mockImplementation(async ({ contents }) => {
      const part = contents?.[0]?.parts?.[0];
      lastAnalysisPrompt = typeof part?.text === "string" ? part.text : null;
      return { response: { text: () => analysisResponses.shift() ?? "" } };
    });
    getGenerativeModelMock.mockClear();
    process.env.GOOGLE_GEMINI_API_KEY = "test";
    resetGeminiState();
  });

  it("parses valid JSON response", async () => {
    analysisResponses.push(
      JSON.stringify({
        summary: "Concise summary",
        strengths: ["Strength"],
        weaknesses: ["Weakness"],
        overallScore: 88,
      }),
    );

    const result = await analyzeWithGemini("Seasoned engineer with Java experience.");
    expect(result.summary).toBe("Concise summary");
    expect(result.strengths).toContain("Strength");
    expect(result.weaknesses).toContain("Weakness");
    expect(result.overallScore).toBe(88);
    expect(getGenerativeModelMock).toHaveBeenCalledTimes(2);
  });

  it("retries once when response is not JSON", async () => {
    analysisResponses.push(
      "Not JSON",
      JSON.stringify({ summary: "Fallback", strengths: [], weaknesses: [], overallScore: 70 }),
    );

    const result = await analyzeWithGemini("Full stack engineer");
    expect(result.summary).toBe("Fallback");
    expect(analysisModel.generateContent).toHaveBeenCalledTimes(2);
  });

  it("sanitizes PII before sending to Gemini", async () => {
    analysisResponses.push(JSON.stringify({ summary: "", strengths: [], weaknesses: [], overallScore: 0 }));

    await analyzeWithGemini("Email john.doe@example.com phone +1 555 555 5555");
    expect(lastAnalysisPrompt).toBeTruthy();
    expect(lastAnalysisPrompt).not.toContain("john.doe@example.com");
    expect(lastAnalysisPrompt).not.toContain("555 555 5555");
  });

  it("returns defaults when text is empty", async () => {
    const result = await analyzeWithGemini("   ");
    expect(result.summary).toBe("");
    expect(result.overallScore).toBe(0);
    expect(result.strengths).toHaveLength(0);
  });

  it("throws GeminiQuotaError after max retries", async () => {
    vi.useFakeTimers();
    (analysisModel.generateContent as unknown as Mock).mockImplementation(async () => {
      const error = new Error("429") as Error & { status?: number };
      error.status = 429;
      throw error;
    });

    const promise = analyzeWithGemini("SRE");
    const handled = promise.catch((error) => error);
    await vi.runAllTimersAsync();
    const error = await handled;
    expect(error).toBeInstanceOf(GeminiQuotaError);
    vi.useRealTimers();
  });

  it("honours RetryInfo delays", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    (analysisModel.generateContent as unknown as Mock).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        const error = new Error("429") as Error & { status?: number; errorDetails?: unknown };
        error.status = 429;
        error.errorDetails = [
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "5s",
          },
        ];
        throw error;
      }
      return { response: { text: () => JSON.stringify({ summary: "Retry", strengths: [], weaknesses: [], overallScore: 60 }) } };
    });

    const promise = analyzeWithGemini("Backend engineer");
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result.overallScore).toBe(60);
    expect(callCount).toBe(2);
    vi.useRealTimers();
  });

  it("serves cached entries without touching the SDK", () => {
    setGeminiCache("cv-1", ["js"], "gemini-2.5-flash", {
      summary: "Cached",
      strengths: ["Summary"],
      weaknesses: [],
      overallScore: 75,
    });
    const cached = getGeminiCache("cv-1", ["js"], "gemini-2.5-flash");
    expect(cached?.summary).toBe("Cached");
  });
});
