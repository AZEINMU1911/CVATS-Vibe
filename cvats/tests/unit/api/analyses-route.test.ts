import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyses/route";
import { cvRepository, resetCvRepository } from "@/server/cv-repository";
import { analysisRepository, resetAnalysisRepository } from "@/server/analysis-repository";
import { resetRateLimit } from "@/server/rate-limit";
import { resetGeminiState, setGeminiCache, GeminiQuotaError } from "@/server/analysis/gemini";
import type * as GeminiModule from "@/server/analysis/gemini";

type GeminiModuleType = typeof GeminiModule;

const getAuthSessionMock = vi.fn();
const analyzeWithGeminiMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: () => getAuthSessionMock(),
}));

vi.mock("@/server/analysis/text-extractor", () => ({
  extractTextFromFile: vi.fn(async (url: string, mime: string) => {
    void url;
    void mime;
    return "javascript react node";
  }),
}));

vi.mock("@/server/analysis/gemini", async () => {
  const actual = await vi.importActual<GeminiModuleType>("@/server/analysis/gemini");
  return {
    ...actual,
    analyzeWithGemini: (...args: unknown[]) => analyzeWithGeminiMock(...args),
  };
});

const { extractTextFromFile } = await import("@/server/analysis/text-extractor");

const USER_ID = "analysis-user";
const OTHER_USER_ID = "another";

describe("POST /api/analyses", () => {
  beforeEach(() => {
    resetCvRepository();
    resetAnalysisRepository();
    resetRateLimit();
    resetGeminiState();
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    analyzeWithGeminiMock.mockReset();
    analyzeWithGeminiMock.mockResolvedValue({
      summary: "Seasoned engineer with strong JavaScript focus.",
      strengths: ["Strong JavaScript background"],
      weaknesses: ["Limited backend leadership"],
      overallScore: 82,
    });
    process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_GEMINI_API_KEY;
  });

  it("returns 401 when user is not authenticated", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: "missing" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 404 when CV belongs to another user", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: OTHER_USER_ID } });
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("creates AI-powered analysis when Gemini is configured", async () => {
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      analysis: {
        summary: string | null;
        strengths: string[];
        weaknesses: string[];
        score: number;
        usedFallback?: boolean;
        fallbackReason?: string | null;
      };
    };
    expect(payload.analysis.summary ?? "").toContain("engineer");
    expect(payload.analysis.strengths).toContain("Strong JavaScript background");
    expect(payload.analysis.weaknesses).toContain("Limited backend leadership");
    expect(payload.analysis.score).toBe(82);
    expect(payload.analysis.usedFallback).toBeFalsy();
    expect(extractTextFromFile).toHaveBeenCalled();
    expect(analyzeWithGeminiMock).toHaveBeenCalled();

    const stored = await analysisRepository.listByCvId(cv.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.summary ?? "").toContain("engineer");
  });

  it("uses cached Gemini analysis when available", async () => {
    const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    setGeminiCache(cv.id, ["javascript", "react", "node", "typescript", "nextjs"], modelId, {
      summary: "Cached insight",
      strengths: ["Cached strength"],
      weaknesses: ["Cached weakness"],
      overallScore: 90,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      analysis: { summary: string | null; strengths: string[]; weaknesses: string[]; score: number };
    };
    expect(payload.analysis.summary).toBe("Cached insight");
    expect(payload.analysis.strengths).toContain("Cached strength");
    expect(payload.analysis.score).toBe(90);
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
  });

  it("falls back to keyword scoring when Gemini errors", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiQuotaError("QUOTA", "quota exceeded"));

    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      analysis: {
        summary: string | null;
        strengths: string[];
        message?: string | null;
        usedFallback?: boolean;
        fallbackReason?: string | null;
      };
    };
    expect(payload.analysis.summary).toBeNull();
    expect(payload.analysis.strengths).toContain("javascript");
    expect(payload.analysis.message ?? "").toContain("quota");
    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("QUOTA");
  });

  it("uses fallback when Gemini API key is missing", async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;

    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      analysis: { strengths: string[]; weaknesses: string[]; usedFallback?: boolean };
    };
    expect(payload.analysis.strengths).toContain("javascript");
    expect(payload.analysis.weaknesses.length).toBeGreaterThanOrEqual(0);
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
    expect(payload.analysis.usedFallback).toBeFalsy();
  });

  it("returns message when extracted text is empty", async () => {
    vi.mocked(extractTextFromFile).mockResolvedValueOnce(" ");

    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.docx",
      fileUrl: "https://example.com/sample.docx",
      fileSize: 1024,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      publicId: null,
    });

    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: cv.id }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      analysis: { score: number; message?: string | null; weaknesses: string[]; usedFallback?: boolean };
    };
    expect(payload.analysis.score).toBe(0);
    expect(payload.analysis.message).toBeTruthy();
    expect(payload.analysis.weaknesses.length).toBeGreaterThan(0);
    expect(payload.analysis.usedFallback).toBeFalsy();
  });
});
