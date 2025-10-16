import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyses/route";
import { cvRepository, resetCvRepository } from "@/server/cv-repository";
import { analysisRepository, resetAnalysisRepository } from "@/server/analysis-repository";
import { resetRateLimit } from "@/server/rate-limit";
import {
  GeminiParseError,
  GeminiQuotaError,
  type GeminiFileAnalysis,
} from "@/server/analysis/gemini";
import type * as GeminiModule from "@/server/analysis/gemini";

type GeminiModuleType = typeof GeminiModule;

const USER_ID = "analysis-user";
const OTHER_USER_ID = "other-user";

const getAuthSessionMock = vi.fn();
const analyzeWithGeminiMock = vi.fn();
const extractTextFromBufferMock = vi.fn();

const originalFetch = global.fetch;

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: () => getAuthSessionMock(),
}));

vi.mock("@/server/analysis/text-extractor", () => ({
  extractTextFromBuffer: (...args: unknown[]) => extractTextFromBufferMock(...args),
  extractTextFromFile: vi.fn(),
}));

vi.mock("@/server/analysis/gemini", async () => {
  const actual = await vi.importActual<GeminiModuleType>("@/server/analysis/gemini");
  return {
    ...actual,
    analyzeWithGeminiFile: (...args: unknown[]) => analyzeWithGeminiMock(...args),
  };
});

const sampleGeminiResult: GeminiFileAnalysis = {
  atsScore: 83,
  feedback: {
    positive: ["Delivers high-impact front-end projects"],
    improvements: ["Highlight cross-team collaboration"],
  },
  keywords: {
    extracted: ["react", "typescript"],
    missing: ["aws"],
  },
};

type ApiAnalysis = GeminiFileAnalysis & {
  id: string;
  cvId: string;
  usedFallback: boolean;
  fallbackReason: string | null;
  createdAt: string;
};

type AnalysisResponseBody = { analysis: ApiAnalysis };

const makeResponse = (buffer: ArrayBuffer, mime = "application/pdf"): Response =>
  new Response(buffer, {
    status: 200,
    headers: { "content-type": mime },
  });

beforeEach(() => {
  resetCvRepository();
  resetAnalysisRepository();
  resetRateLimit();
  getAuthSessionMock.mockReset();
  extractTextFromBufferMock.mockReset();
  analyzeWithGeminiMock.mockReset();
  getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  extractTextFromBufferMock.mockResolvedValue("javascript react node");
  analyzeWithGeminiMock.mockResolvedValue(sampleGeminiResult);
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  global.fetch = vi.fn(async () => {
    const encoder = new TextEncoder();
    return makeResponse(encoder.encode("%PDF resume").buffer);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
  global.fetch = originalFetch;
  delete process.env.GOOGLE_GEMINI_API_KEY;
});

const createRequest = (payload: unknown) =>
  new Request("http://localhost/api/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("POST /api/analyses", () => {
  it("returns 401 when the user is not authenticated", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    const response = await POST(createRequest({ cvId: "missing" }));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the CV belongs to another user", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: OTHER_USER_ID } });
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(404);
  });

  it("creates a Gemini-backed analysis and persists history", async () => {
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.atsScore).toBe(sampleGeminiResult.atsScore);
    expect(payload.analysis.feedback.positive).toContain("Delivers high-impact front-end projects");
    expect(payload.analysis.usedFallback).toBe(false);
    expect(payload.analysis.fallbackReason).toBeNull();

    const stored = await analysisRepository.findLatestForCv(cv.id, USER_ID);
    expect(stored?.atsScore).toBe(sampleGeminiResult.atsScore);
    expect(stored?.usedFallback).toBe(false);

    const updatedCv = await cvRepository.findById(cv.id);
    expect(updatedCv?.atsScore).toBe(sampleGeminiResult.atsScore);
    expect(updatedCv?.analyzedAt).toBeTruthy();

    expect(analyzeWithGeminiMock).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(cv.fileUrl);
  });

  it("falls back to keyword scoring when Gemini quota errors", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiQuotaError("Quota exceeded"));
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("QUOTA");
    expect(payload.analysis.keywords.extracted).toContain("javascript");
    expect(payload.analysis.keywords.missing).toContain("typescript");
    expect(extractTextFromBufferMock).toHaveBeenCalled();
  });

  it("falls back with PARSE reason when Gemini returns malformed JSON", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("invalid json"));
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("PARSE");
  });

  it("falls back with EMPTY reason when Gemini returns empty content", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("EMPTY_OR_NON_JSON"));
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("EMPTY");
  });

  it("falls back with SAFETY reason when Gemini rejects safety settings", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("SAFETY_REJECTION"));
    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "sample.pdf",
      fileUrl: "https://example.com/sample.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("SAFETY");
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

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("PARSE");
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
  });

  it("returns 413 when file exceeds configured limit", async () => {
    const largeArray = new Uint8Array(ANALYSIS_MAX_FILE_MB * 1024 * 1024 + 1);
    global.fetch = vi.fn(async () => makeResponse(largeArray.buffer)) as unknown as typeof fetch;

    const cv = await cvRepository.createForUser(USER_ID, {
      fileName: "oversize.pdf",
      fileUrl: "https://example.com/oversize.pdf",
      fileSize: largeArray.length,
      mimeType: "application/pdf",
      publicId: null,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(413);
  });
});

const ANALYSIS_MAX_FILE_MB = Number.parseInt(process.env.ANALYSIS_MAX_FILE_MB ?? "10", 10) || 10;
