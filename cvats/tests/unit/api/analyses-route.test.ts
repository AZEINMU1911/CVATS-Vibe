import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyses/route";
import { cvRepository, resetCvRepository } from "@/server/cv-repository";
import type { CreateCvInput } from "@/server/cv-repository";
import { analysisRepository, resetAnalysisRepository } from "@/server/analysis-repository";
import { resetRateLimit } from "@/server/rate-limit";
import {
  GeminiParseError,
  GeminiQuotaError,
  type GeminiFileAnalysis,
} from "@/server/analysis/gemini";
import type * as GeminiModule from "@/server/analysis/gemini";

const signedRawUrlMock = vi.fn<(publicId: string, version?: number | string) => string>();

vi.mock("@/server/cloudinary-auth", () => ({
  signedRawUrl: (publicId: string, version?: number | string) => signedRawUrlMock(publicId, version),
}));

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

let defaultBuffer: ArrayBuffer;
let defaultInlineBytes: string;

const makeResponse = (buffer: ArrayBuffer, mime = "application/pdf"): Response =>
  new Response(buffer, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-length": String(buffer.byteLength),
    },
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
  signedRawUrlMock.mockReset();
  signedRawUrlMock.mockReturnValue("https://res.cloudinary.com/demo/raw/authenticated/v1/sample.pdf");
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  const encoder = new TextEncoder();
  defaultBuffer = encoder.encode("%PDF resume").buffer;
  defaultInlineBytes = Buffer.from(new Uint8Array(defaultBuffer)).toString("base64");
  global.fetch = vi.fn(async (_input, init) => {
    if (init?.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": String(defaultBuffer.byteLength),
          "content-type": "application/pdf",
        },
      });
    }
    return makeResponse(defaultBuffer);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
  global.fetch = originalFetch;
  delete process.env.GOOGLE_GEMINI_API_KEY;
});

const createRequest = (payload: {
  cvId?: string;
  keywords?: string[];
  __bytes?: string;
  mimeType?: string;
}) =>
  new Request("http://localhost/api/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

const buildCvInput = (overrides: Partial<CreateCvInput> = {}): CreateCvInput => ({
  fileName: "sample.pdf",
  fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/sample.pdf",
  secureUrl: "https://res.cloudinary.com/demo/raw/upload/v1/sample.pdf",
  publicId: "cvats/sample",
  resourceType: "raw",
  accessMode: "public",
  type: "upload",
  fileSize: 2048,
  mimeType: "application/pdf",
  bytes: 2048,
  format: "pdf",
  originalFilename: "sample",
  createdAtRaw: "2024-01-01T00:00:00Z",
  ...overrides,
});

const createCv = async (overrides: Partial<CreateCvInput> = {}) =>
  cvRepository.createForUser(USER_ID, buildCvInput(overrides));

describe("POST /api/analyses", () => {
  it("returns 401 when the user is not authenticated", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    const response = await POST(createRequest({ cvId: "missing" }));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the CV belongs to another user", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: OTHER_USER_ID } });
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(404);
  });

  it("creates a Gemini-backed analysis and persists history", async () => {
    const cv = await createCv({ fileSize: 2048, bytes: 2048 });

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
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
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back to keyword scoring when Gemini quota errors", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiQuotaError("Quota exceeded"));
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("QUOTA");
    expect(payload.analysis.keywords.extracted).toContain("javascript");
    expect(payload.analysis.keywords.missing).toContain("typescript");
    expect(extractTextFromBufferMock).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back with PARSE reason when Gemini request times out", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("TIMEOUT"));
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("PARSE");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back with EMPTY reason when Gemini returns empty content", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("EMPTY_OR_NON_JSON"));
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("EMPTY");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back with EMPTY_PROD reason when Gemini signals production empty", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("EMPTY_PROD"));
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("EMPTY_PROD");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back with SAFETY reason when Gemini rejects safety settings", async () => {
    analyzeWithGeminiMock.mockRejectedValueOnce(new GeminiParseError("SAFETY_REJECTION"));
    const cv = await createCv();

    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: defaultInlineBytes, mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("SAFETY");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses fallback when Gemini API key is missing", async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    const cv = await createCv();

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as AnalysisResponseBody;

    expect(payload.analysis.usedFallback).toBe(true);
    expect(payload.analysis.fallbackReason).toBe("PARSE");
    expect(analyzeWithGeminiMock).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it("returns 400 when inline bytes are invalid base64", async () => {
    const cv = await createCv();
    const response = await POST(
      createRequest({ cvId: cv.id, __bytes: "%%%invalid%%%", mimeType: "application/pdf" }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("INVALID_INLINE_BYTES");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when both public and authenticated Cloudinary delivery fail", async () => {
    global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        if (url.includes("/raw/authenticated/")) {
          return new Response(null, { status: 404 });
        }
        return new Response(null, { status: 403 });
      }
      const encoder = new TextEncoder();
      return makeResponse(encoder.encode("%PDF resume").buffer);
    }) as unknown as typeof fetch;

    const cv = await createCv();
    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("CLOUDINARY_FETCH_FAILED");
    expect(signedRawUrlMock).toHaveBeenCalledWith("cvats/sample", 1);
    expect(signedRawUrlMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to authenticated delivery when public Cloudinary access is blocked", async () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("%PDF resume").buffer;
    const signedUrl = "https://res.cloudinary.com/demo/raw/authenticated/v1/sample.pdf";
    signedRawUrlMock.mockReturnValueOnce(signedUrl);

    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        if (url === signedUrl) {
          return new Response(null, {
            status: 200,
            headers: {
              "content-length": String(buffer.byteLength),
              "content-type": "application/pdf",
            },
          });
        }
        return new Response(null, { status: 403 });
      }
      if (url === signedUrl) {
        return makeResponse(buffer);
      }
      return new Response(null, { status: 403 });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const cv = await createCv();
    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    expect(signedRawUrlMock).toHaveBeenCalledWith("cvats/sample", 1);
    expect(signedRawUrlMock).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(signedUrl, expect.objectContaining({ method: "HEAD" }));
    expect(fetchSpy).toHaveBeenCalledWith(signedUrl);
  });

  it("normalizes legacy image delivery URLs to raw for document downloads", async () => {
    const legacyUrl = "https://res.cloudinary.com/demo/image/upload/v1/folder/sample.pdf";
    const encoder = new TextEncoder();
    const buffer = encoder.encode("%PDF resume").buffer;
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        expect(url).toContain("/raw/upload/");
        expect(url).not.toContain("/image/upload/");
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": String(buffer.byteLength),
            "content-type": "application/pdf",
          },
        });
      }
      return makeResponse(buffer);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const cv = await createCv({ fileUrl: legacyUrl, secureUrl: "" });
    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/raw/upload/"),
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(signedRawUrlMock).not.toHaveBeenCalled();
  });

  it("returns 413 when file exceeds configured limit", async () => {
    const largeArray = new Uint8Array(ANALYSIS_MAX_FILE_MB * 1024 * 1024 + 1);
    global.fetch = vi.fn(async () => makeResponse(largeArray.buffer)) as unknown as typeof fetch;

    const cv = await createCv({
      fileName: "oversize.pdf",
      fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/oversize.pdf",
      secureUrl: "https://res.cloudinary.com/demo/raw/upload/v1/oversize.pdf",
      fileSize: largeArray.length,
      bytes: largeArray.length,
    });

    const response = await POST(createRequest({ cvId: cv.id }));
    expect(response.status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

const ANALYSIS_MAX_FILE_MB = Number.parseInt(process.env.ANALYSIS_MAX_FILE_MB ?? "10", 10) || 10;
