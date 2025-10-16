import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { analyzeWithGeminiFile } from "@/server/analysis/gemini";

type AnalyzeWithGeminiFileFn = typeof analyzeWithGeminiFile;

const geminiMocks = {
  generateContent: vi.fn(),
  uploadFile: vi.fn(),
  getFile: vi.fn(),
  deleteFile: vi.fn(),
};

const setNodeEnv = (value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "string") {
    env.NODE_ENV = value;
  } else {
    delete env.NODE_ENV;
  }
};

vi.mock("@google/generative-ai", () => {
  class GoogleGenerativeAI {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    getGenerativeModel() {
      return { generateContent: geminiMocks.generateContent };
    }
  }

  class GoogleAIFileManager {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    uploadFile = geminiMocks.uploadFile;
    getFile = geminiMocks.getFile;
    deleteFile = geminiMocks.deleteFile;
  }

  const HarmCategory = {
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
  } as const;

  const HarmBlockThreshold = {
    BLOCK_NONE: "BLOCK_NONE",
  } as const;

  return {
    GoogleGenerativeAI,
    GoogleAIFileManager,
    HarmCategory,
    HarmBlockThreshold,
  };
});

vi.mock("@google/generative-ai/server", () => {
  class GoogleAIFileManager {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    uploadFile = geminiMocks.uploadFile;
    getFile = geminiMocks.getFile;
    deleteFile = geminiMocks.deleteFile;
  }

  return { GoogleAIFileManager };
});

describe("analyzeWithGeminiFile production diagnostics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let analyzeWithGeminiFile: AnalyzeWithGeminiFileFn;
  let consoleWarnSpy: MockInstance;

  beforeAll(async () => {
    setNodeEnv("production");
    process.env.GOOGLE_GEMINI_API_KEY = "test-key";
    vi.resetModules();
    ({ analyzeWithGeminiFile } = await import("@/server/analysis/gemini"));
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
    delete process.env.GOOGLE_GEMINI_API_KEY;
  });

  beforeEach(() => {
    for (const mock of Object.values(geminiMocks)) {
      mock.mockReset();
    }
    geminiMocks.generateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: JSON.stringify({ atsScore: 70, feedback: { positive: [], improvements: [] }, keywords: { extracted: [], missing: [] } }) }],
            },
          },
        ],
        promptFeedback: { blockReason: "NONE" },
      },
    });
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("logs production diagnostics with finishReason data", async () => {
    await analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[gemini] prod run",
      expect.objectContaining({
        path: "inlineData",
        model: expect.any(String),
        mime: "application/pdf",
        size: expect.any(Number),
        attempt: 1,
      }),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[gemini] prod outcome",
      expect.objectContaining({
        finishReason: "STOP",
        hasText: true,
        promptFeedback: "NONE",
      }),
    );
  });
});
