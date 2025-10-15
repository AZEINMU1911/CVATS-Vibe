import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyses/route";
import { cvRepository, resetCvRepository, STUB_USER_ID } from "@/server/cv-repository";
import { analysisRepository, resetAnalysisRepository } from "@/server/analysis-repository";

vi.mock("@/server/analysis/text-extractor", () => ({
  extractTextFromFile: vi.fn(async (url: string, mime: string) => {
    void url;
    void mime;
    return "javascript react node";
  }),
}));

const { extractTextFromFile } = await import("@/server/analysis/text-extractor");

describe("POST /api/analyses", () => {
  beforeEach(() => {
    resetCvRepository();
    resetAnalysisRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when cvId does not exist", async () => {
    const request = new Request("http://localhost/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId: "missing" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("creates analysis and returns score", async () => {
    const cv = await cvRepository.createForUser(STUB_USER_ID, {
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
      analysis: { score: number; keywordsMatched: string[] };
    };
    expect(payload.analysis.score).toBeGreaterThan(0);
    expect(payload.analysis.keywordsMatched).toContain("javascript");
    expect(extractTextFromFile).toHaveBeenCalled();

    const stored = await analysisRepository.listByCvId(cv.id);
    expect(stored).toHaveLength(1);
  });

  it("returns score 0 when text is empty (docx stub)", async () => {
    vi.mocked(extractTextFromFile).mockResolvedValueOnce(" ");

    const cv = await cvRepository.createForUser(STUB_USER_ID, {
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
      analysis: { score: number; message?: string | null };
    };
    expect(payload.analysis.score).toBe(0);
    expect(payload.analysis.message).toBeTruthy();
  });
});
