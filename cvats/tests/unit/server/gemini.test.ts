import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  analyzeWithGeminiFile,
  GeminiParseError,
  GeminiQuotaError,
  parseGeminiJson,
  type GeminiFileAnalysis,
} from "@/server/analysis/gemini";

let generateContentMock: Mock;
let uploadFileMock: Mock;
let getFileMock: Mock;
let deleteFileMock: Mock;

vi.mock("@google/generative-ai", () => {
  const mocks = {
    generateContent: vi.fn(),
    uploadFile: vi.fn(),
    getFile: vi.fn(),
    deleteFile: vi.fn(),
  };

  (globalThis as typeof globalThis & { __geminiMocks?: typeof mocks }).__geminiMocks = mocks;

  class GoogleGenerativeAI {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    getGenerativeModel() {
      return { generateContent: mocks.generateContent };
    }
  }

  class GoogleAIFileManager {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    uploadFile = mocks.uploadFile;
    getFile = mocks.getFile;
    deleteFile = mocks.deleteFile;
  }

  const HarmCategory = {
    HARM_CATEGORY_UNSPECIFIED: "HARM_CATEGORY_UNSPECIFIED",
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
    HARM_CATEGORY_CIVIC_INTEGRITY: "HARM_CATEGORY_CIVIC_INTEGRITY",
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
  const existing = (globalThis as typeof globalThis & { __geminiMocks?: { generateContent: Mock; uploadFile: Mock; getFile: Mock; deleteFile: Mock } }).__geminiMocks;
  const mocks =
    existing ?? {
      generateContent: vi.fn(),
      uploadFile: vi.fn(),
      getFile: vi.fn(),
      deleteFile: vi.fn(),
    };
  (globalThis as typeof globalThis & { __geminiMocks?: typeof mocks }).__geminiMocks = mocks;

  class GoogleAIFileManager {
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error("missing key");
      }
    }

    uploadFile = mocks.uploadFile;
    getFile = mocks.getFile;
    deleteFile = mocks.deleteFile;
  }

  return { GoogleAIFileManager };
});

const sampleAnalysis: GeminiFileAnalysis = {
  atsScore: 78,
  feedback: {
    positive: ["Clear React experience"],
    improvements: ["Expand on backend ownership"],
  },
  keywords: {
    extracted: ["react", "typescript"],
    missing: ["aws"],
  },
};

const candidateResponse = (text: string, finishReason = "STOP") => ({
  response: {
    candidates: [
      {
        finishReason,
        content: {
          parts: text ? [{ text }] : [],
        },
      },
    ],
  },
});

beforeEach(() => {
  const geminiMocks = (globalThis as typeof globalThis & { __geminiMocks?: { generateContent: Mock; uploadFile: Mock; getFile: Mock; deleteFile: Mock } }).__geminiMocks;
  if (!geminiMocks) {
    throw new Error("Gemini mocks not initialised");
  }
  generateContentMock = geminiMocks.generateContent;
  uploadFileMock = geminiMocks.uploadFile;
  getFileMock = geminiMocks.getFile;
  deleteFileMock = geminiMocks.deleteFile;

  generateContentMock.mockReset();
  uploadFileMock.mockReset();
  getFileMock.mockReset();
  deleteFileMock.mockReset();

  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  uploadFileMock.mockResolvedValue({
    file: {
      name: "files/test",
      uri: "files/test",
      state: "ACTIVE",
    },
  });
  getFileMock.mockResolvedValue({
    name: "files/test",
    uri: "files/test",
    state: "ACTIVE",
  });
  deleteFileMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GOOGLE_GEMINI_API_KEY;
});

describe("parseGeminiJson", () => {
  it("parses raw JSON payload", () => {
    const payload = JSON.stringify(sampleAnalysis);
    expect(parseGeminiJson(payload)).toEqual(sampleAnalysis);
  });

  it("parses fenced JSON payload", () => {
    const payload = `\`\`\`json\n${JSON.stringify(sampleAnalysis)}\n\`\`\``;
    expect(parseGeminiJson(payload)).toEqual(sampleAnalysis);
  });

  it("parses JSON when wrapped inside prose and fences", () => {
    const payload = `Here you go:\n\`\`\`\n${JSON.stringify(sampleAnalysis)}\n\`\`\`\nThanks!`;
    expect(parseGeminiJson(payload)).toEqual(sampleAnalysis);
  });

  it("throws GeminiParseError for invalid JSON", () => {
    expect(() => parseGeminiJson("not json")).toThrow(GeminiParseError);
  });
});

describe("analyzeWithGeminiFile", () => {
  it("returns parsed analysis for a successful inline response", async () => {
    generateContentMock.mockResolvedValueOnce(candidateResponse(JSON.stringify(sampleAnalysis)));

    const result = await analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" });

    expect(result).toEqual(sampleAnalysis);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it("falls back to file upload when inline response is empty", async () => {
    generateContentMock
      .mockResolvedValueOnce(candidateResponse(""))
      .mockResolvedValueOnce(candidateResponse(JSON.stringify(sampleAnalysis)));

    const result = await analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" });

    expect(result).toEqual(sampleAnalysis);
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith("files/test");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("falls back with safety reason when the model rejects safety settings", async () => {
    const error = Object.assign(new Error("Safety settings invalid"), { status: 400 });
    generateContentMock.mockRejectedValueOnce(error);

    await expect(
      analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" }),
    ).rejects.toBeInstanceOf(GeminiParseError);
  });

  it("throws GeminiParseError when both attempts are empty", async () => {
    generateContentMock.mockResolvedValue(candidateResponse(""));

    await expect(
      analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" }),
    ).rejects.toHaveProperty("message", "EMPTY_OR_NON_JSON");
    expect(uploadFileMock).toHaveBeenCalled();
  });

  it("propagates quota errors with capped retry info", async () => {
    const quotaError = Object.assign(new Error("429"), {
      status: 429,
      errorDetails: [
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "9s",
        },
      ],
    });
    generateContentMock.mockRejectedValueOnce(quotaError);

    const promise = analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" });
    await expect(promise).rejects.toBeInstanceOf(GeminiQuotaError);
  });

  it("parses fenced JSON returned from the file upload attempt", async () => {
    generateContentMock
      .mockResolvedValueOnce(candidateResponse(""))
      .mockResolvedValueOnce(candidateResponse(`\`\`\`json\n${JSON.stringify(sampleAnalysis)}\n\`\`\``));

    const result = await analyzeWithGeminiFile({ file: Buffer.from("resume"), mime: "application/pdf" });
    expect(result).toEqual(sampleAnalysis);
  });
});
