import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type GenerateContentRequest,
  type GenerativeModel,
  type SafetySetting,
} from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { z } from "zod";

export interface GeminiFileInput {
  file: Buffer;
  mime?: string;
}

const RESULT_SCHEMA = z.object({
  atsScore: z.number().int().min(0).max(100),
  feedback: z.object({
    positive: z.array(z.string()),
    improvements: z.array(z.string()),
  }),
  keywords: z.object({
    extracted: z.array(z.string()),
    missing: z.array(z.string()),
  }),
});

export type GeminiFileAnalysis = z.infer<typeof RESULT_SCHEMA>;

export class GeminiQuotaError extends Error {
  constructor(message: string, public readonly retryAt?: number) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export type GeminiParseErrorCode =
  | "EMPTY_OR_NON_JSON"
  | "EMPTY_PROD"
  | "SAFETY_REJECTION"
  | "TIMEOUT";

export class GeminiParseError extends Error {
  constructor(public readonly code: GeminiParseErrorCode) {
    super(code);
    this.name = "GeminiParseError";
  }
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = Number.parseInt(process.env.GEMINI_MAX_TOKENS ?? "1024", 10) || 1024;
const MAX_BACKOFF_MS = Number.parseInt(process.env.GEMINI_MAX_BACKOFF_MS ?? "4000", 10) || 4000;
const PROD_ANALYSIS_TIMEOUT_MS = 7_000;
const PROMPT_JSON_ONLY =
  "You are an applicant tracking system reviewer. Respond in STRICT JSON only (no markdown), matching this schema:\n{\n  \"atsScore\": number 0-100,\n  \"feedback\": { \"positive\": string[], \"improvements\": string[] },\n  \"keywords\": { \"extracted\": string[], \"missing\": string[] }\n}\nKeep arrays concise and free of empty strings.";

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";
const devLog = (event: string, payload?: Record<string, unknown>) => {
  if (!isDev) return;
  if (payload) {
    console.debug(event, payload);
  } else {
    console.debug(event);
  }
};

const getApiKey = (): string => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  return apiKey;
};

const SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const getModel = (): GenerativeModel => {
  const genAI = new GoogleGenerativeAI(getApiKey());
  return genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: DEFAULT_MAX_TOKENS,
      responseMimeType: "application/json",
    },
    safetySettings: SAFETY_SETTINGS,
  });
};

const getFileManager = (): GoogleAIFileManager => new GoogleAIFileManager(getApiKey());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || !error) return null;
  const candidate = error as { status?: unknown; cause?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (candidate.cause) return getStatus(candidate.cause);
  return null;
};

const extractRetryMs = (error: unknown): number | null => {
  if (typeof error !== "object" || !error) return null;
  const candidate = error as { errorDetails?: unknown; cause?: unknown };
  if (Array.isArray(candidate.errorDetails)) {
    for (const detail of candidate.errorDetails) {
      if (typeof detail !== "object" || !detail) continue;
      const record = detail as Record<string, unknown>;
      if (record["@type"] === "type.googleapis.com/google.rpc.RetryInfo") {
        const retryDelay = record.retryDelay;
        if (typeof retryDelay === "string") {
          const match = retryDelay.match(/([0-9.]+)s/);
          if (match) {
            return Math.max(0, Math.round(Number(match[1]) * 1000));
          }
        }
      }
    }
  }
  if (candidate.cause) return extractRetryMs(candidate.cause);
  return null;
};

type AttemptOutcome = {
  text: string;
  finishReason: string;
  promptFeedback?: unknown;
};

const runModelRequest = async (
  model: GenerativeModel,
  request: GenerateContentRequest,
  timeoutMs?: number,
): Promise<AttemptOutcome> => {
  const execution = (async () => {
    try {
      const result = await model.generateContent(request);
      const candidate = result.response?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "UNKNOWN";
      const parts = candidate?.content?.parts ?? [];
      const text = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
      const promptFeedback = result.response?.promptFeedback;
      devLog("GEMINI_ATTEMPT_FINISH", { finishReason, promptFeedback });
      return { text, finishReason, promptFeedback };
    } catch (error) {
      const status = getStatus(error);
      if (status === 429) {
        const retryMs = Math.min(extractRetryMs(error) ?? 1000, MAX_BACKOFF_MS);
        await sleep(retryMs);
        throw new GeminiQuotaError("Gemini quota exceeded", Date.now() + retryMs);
      }
      if (status === 400) {
        console.warn("[gemini] safety setting issue", (error as Error)?.message ?? "");
        throw new GeminiParseError("SAFETY_REJECTION");
      }
      throw error;
    }
  })();

  if (!timeoutMs || timeoutMs <= 0) {
    return execution;
  }

  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<AttemptOutcome>((_, reject) => {
    timer = setTimeout(() => {
      reject(new GeminiParseError("TIMEOUT"));
    }, timeoutMs);
  });

  try {
    return (await Promise.race([execution, timeoutPromise])) as AttemptOutcome;
  } catch (error) {
    if (error instanceof GeminiParseError && error.code === "TIMEOUT") {
      void execution.catch(() => undefined);
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const shouldRetry = (outcome: AttemptOutcome): boolean => {
  if (!outcome.text.trim()) return true;
  if (outcome.finishReason && outcome.finishReason !== "STOP") return true;
  return false;
};

const buildInlineContents = (file: Buffer, mime?: string): Content[] => {
  const normalizedMime = mime?.trim() || "application/pdf";
  return [
    {
      role: "user",
      parts: [
        { inlineData: { data: file.toString("base64"), mimeType: normalizedMime } },
        { text: PROMPT_JSON_ONLY },
      ],
    },
  ];
};

const buildFileContents = (fileUri: string, mime?: string): Content[] => {
  const normalizedMime = mime?.trim() || "application/pdf";
  return [
    {
      role: "user",
      parts: [
        { fileData: { fileUri, mimeType: normalizedMime } },
        { text: PROMPT_JSON_ONLY },
      ],
    },
  ];
};

const stripMarkdownFence = (value: string): string | null => {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  return null;
};

const parseGeminiJson = (payload: string): GeminiFileAnalysis => {
  const attemptParse = (source: string): GeminiFileAnalysis => {
    const trimmed = source.trim();
    if (!trimmed) {
      throw new GeminiParseError("EMPTY_OR_NON_JSON");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new GeminiParseError("EMPTY_OR_NON_JSON");
    }
    const validated = RESULT_SCHEMA.safeParse(parsed);
    if (!validated.success) {
      throw new GeminiParseError("EMPTY_OR_NON_JSON");
    }
    return validated.data;
  };

  try {
    return attemptParse(payload);
  } catch (error) {
    if (error instanceof GeminiParseError) {
      const stripped = stripMarkdownFence(payload);
      if (stripped) {
        return attemptParse(stripped);
      }
    }
    throw new GeminiParseError("EMPTY_OR_NON_JSON");
  }
};

const ensureFileActive = async (
  manager: GoogleAIFileManager,
  metadata: { name?: string; uri?: string; state?: string } | undefined,
): Promise<string | null> => {
  if (!metadata?.name) return metadata?.uri ?? null;
  if (metadata.state === "ACTIVE" && metadata.uri) {
    return metadata.uri;
  }

  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    await sleep(200 * attempts);
    try {
      const file = await manager.getFile(metadata.name);
      if (file?.state === "ACTIVE" && file?.uri) {
        return file.uri;
      }
    } catch {
      break;
    }
  }
  return metadata?.uri ?? null;
};

const runFileUploadAttempt = async (
  model: GenerativeModel,
  input: GeminiFileInput,
  timeoutMs?: number,
): Promise<AttemptOutcome> => {
  const manager = getFileManager();
  const upload = await manager.uploadFile(input.file, {
    mimeType: input.mime?.trim() || "application/pdf",
    displayName: "cv-analysis",
  });
  const fileName = upload.file?.name;
  const fileUri = await ensureFileActive(manager, upload.file);

  if (!fileName || !fileUri) {
    devLog("GEMINI_FILE_UPLOAD_MISSING_URI", { fileName, state: upload.file?.state });
    return { text: "", finishReason: "MISSING_URI" };
  }

  try {
    const request: GenerateContentRequest = { contents: buildFileContents(fileUri, input.mime) };
    return await runModelRequest(model, request, timeoutMs);
  } finally {
    void manager.deleteFile(fileName).catch(() => undefined);
  }
};

export const analyzeWithGeminiFile = async (input: GeminiFileInput): Promise<GeminiFileAnalysis> => {
  const model = getModel();
  const normalizedMime = input.mime?.trim() || "application/pdf";
  const fileSize = input.file.byteLength;
  const deadline = isProd ? Date.now() + PROD_ANALYSIS_TIMEOUT_MS : null;

  const ensureTimeRemaining = (): number | undefined => {
    if (!deadline) {
      return undefined;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new GeminiParseError("TIMEOUT");
    }
    return remaining;
  };

  const logProdAttemptStart = (path: "inlineData" | "fileAPI", attempt: number) => {
    if (!isProd) {
      return;
    }
    console.warn("[gemini] prod run", {
      path,
      model: DEFAULT_MODEL,
      mime: normalizedMime,
      size: fileSize,
      attempt,
    });
  };

  const logProdAttemptOutcome = (
    path: "inlineData" | "fileAPI",
    attempt: number,
    outcome: AttemptOutcome,
  ) => {
    if (!isProd) {
      return;
    }
    const promptFeedbackRecord =
      typeof outcome.promptFeedback === "object" && outcome.promptFeedback
        ? (outcome.promptFeedback as { blockReason?: unknown })
        : null;
    const promptFeedback =
      promptFeedbackRecord && "blockReason" in promptFeedbackRecord
        ? (promptFeedbackRecord.blockReason as string | null | undefined) ?? null
        : null;
    console.warn("[gemini] prod outcome", {
      finishReason: outcome.finishReason,
      hasText: outcome.text.trim().length > 0,
      promptFeedback,
    });
  };

  const inlineRequest: GenerateContentRequest = {
    contents: buildInlineContents(input.file, normalizedMime),
  };
  const inlineTimeout = ensureTimeRemaining();
  logProdAttemptStart("inlineData", 1);
  const inlineOutcome = await runModelRequest(model, inlineRequest, inlineTimeout);
  logProdAttemptOutcome("inlineData", 1, inlineOutcome);

  if (!shouldRetry(inlineOutcome)) {
    if (isDev) console.log("GEMINI_RAW_RESPONSE", inlineOutcome.text);
    return parseGeminiJson(inlineOutcome.text);
  }

  devLog("GEMINI_INLINE_EMPTY", {
    finishReason: inlineOutcome.finishReason,
    promptFeedback: inlineOutcome.promptFeedback,
  });

  const fileTimeout = ensureTimeRemaining();
  logProdAttemptStart("fileAPI", 2);
  const fileOutcome = await runFileUploadAttempt(model, { ...input, mime: normalizedMime }, fileTimeout);
  logProdAttemptOutcome("fileAPI", 2, fileOutcome);

  if (!shouldRetry(fileOutcome)) {
    if (isDev) console.log("GEMINI_RAW_RESPONSE", fileOutcome.text);
    return parseGeminiJson(fileOutcome.text);
  }

  devLog("GEMINI_FILE_EMPTY", {
    finishReason: fileOutcome.finishReason,
    promptFeedback: fileOutcome.promptFeedback,
  });

  throw new GeminiParseError(isProd ? "EMPTY_PROD" : "EMPTY_OR_NON_JSON");
};

export { parseGeminiJson };
