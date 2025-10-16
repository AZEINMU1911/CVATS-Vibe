import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

export interface GeminiOptions {
  model?: string;
  maxTokens?: number;
}

export interface GeminiAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  overallScore: number;
}

export class GeminiQuotaError extends Error {
  constructor(public readonly reason: "QUOTA" | "COOLDOWN", message: string, public readonly retryAt?: number) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

type GeminiContent = Array<{ role: "user" | "system" | "model"; parts: Array<{ text: string }> }>;

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = Number.parseInt(process.env.GEMINI_MAX_TOKENS ?? "1024", 10) || 1024;
const MAX_CHARS = 7000;
const CHUNK_SIZE = 3500;
const DEFAULT_MAX_RETRIES = Number.parseInt(process.env.GEMINI_MAX_RETRIES ?? "3", 10) || 3;
const COOLDOWN_MS = (Number.parseInt(process.env.GEMINI_COOLDOWN_SECONDS ?? "60", 10) || 60) * 1000;
const CACHE_TTL_MS = (Number.parseInt(process.env.GEMINI_CACHE_TTL_SECONDS ?? "3600", 10) || 3600) * 1000;
const CACHE_LIMIT = 100;
const SUMMARY_PROMPT =
  "Summarize this resume segment in under 120 words focusing on technical experience, skills, and outcomes.";
const SYSTEM_PROMPT =
  "You are a CV reviewer. Extract strengths/weaknesses, produce a 0-100 score for role-agnostic software SWE fit. Be concise and return strict JSON.";

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRegex = /\+?\d[\d\s().-]{7,}\d/g;

const cooldownByModel = new Map<string, number>();
const cacheStore = new Map<string, { value: GeminiAnalysis; expiresAt: number }>();

const sanitizeText = (text: string): string =>
  text.replace(emailRegex, "[redacted email]").replace(phoneRegex, "[redacted phone]").trim();

const chunkText = (text: string, maxChars: number): string[] => {
  const segments: string[] = [];
  let buffer = "";
  for (const part of text.split(/\n{2,}/)) {
    const piece = part.trim();
    if (!piece) continue;
    const combined = buffer ? `${buffer}\n\n${piece}` : piece;
    if (combined.length <= maxChars) {
      buffer = combined;
      continue;
    }
    if (buffer) segments.push(buffer);
    if (piece.length <= maxChars) {
      buffer = piece;
      continue;
    }
    for (let start = 0; start < piece.length; start += maxChars) {
      segments.push(piece.slice(start, start + maxChars));
    }
    buffer = "";
  }
  if (buffer) segments.push(buffer);
  return segments.length > 0 ? segments : [text.slice(0, maxChars)];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getModel = (modelId: string, systemInstruction?: string): GenerativeModel => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel(systemInstruction ? { model: modelId, systemInstruction } : { model: modelId });
};

const getStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || !error) {
    return null;
  }
  const candidate = error as { status?: unknown; cause?: unknown };
  if (typeof candidate.status === "number") {
    return candidate.status;
  }
  if (candidate.cause) {
    return getStatus(candidate.cause);
  }
  return null;
};

const findErrorDetails = (error: unknown): unknown[] => {
  if (typeof error !== "object" || !error) {
    return [];
  }
  const candidate = error as { errorDetails?: unknown; cause?: unknown };
  if (Array.isArray(candidate.errorDetails)) {
    return candidate.errorDetails;
  }
  if (candidate.cause) {
    return findErrorDetails(candidate.cause);
  }
  return [];
};

const parseRetryMs = (details: unknown[]): number | null => {
  for (const entry of details) {
    if (typeof entry !== "object" || !entry) continue;
    const record = entry as Record<string, unknown>;
    if (record["@type"] === "type.googleapis.com/google.rpc.RetryInfo") {
      const delay = record.retryDelay;
      if (typeof delay === "string") {
        const match = delay.match(/([0-9.]+)s/);
        if (match) {
          return Math.max(0, Math.round(Number(match[1]) * 1000));
        }
      }
    }
  }
  return null;
};

const jitter = (base: number): number => {
  const offset = Math.floor(Math.random() * 400) - 200;
  return Math.max(0, base + offset);
};

const ensureNoCooldown = (modelId: string) => {
  const resumeAt = cooldownByModel.get(modelId);
  if (resumeAt && resumeAt > Date.now()) {
    throw new GeminiQuotaError("COOLDOWN", "Gemini model cooling down", resumeAt);
  }
};

const startCooldown = (modelId: string) => {
  cooldownByModel.set(modelId, Date.now() + COOLDOWN_MS);
};

const handleQuotaError = (modelId: string, retryMs: number | null): GeminiQuotaError => {
  startCooldown(modelId);
  const retryAt = retryMs ? Date.now() + retryMs : undefined;
  return new GeminiQuotaError("QUOTA", "Gemini quota exceeded", retryAt);
};

const generateWithRetry = async (
  model: GenerativeModel,
  modelId: string,
  contents: GeminiContent,
  maxTokens: number,
  maxRetries: number,
  temperature: number,
): Promise<string> => {
  ensureNoCooldown(modelId);
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent({
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      });
      return result?.response?.text()?.trim() ?? "";
    } catch (error) {
      const status = getStatus(error);
      const retryDetails = parseRetryMs(findErrorDetails(error));
      if (status === 429) {
        const delay = retryDetails ?? jitter([1000, 2000, 4000][Math.min(attempt, 2)] ?? 1000);
        console.warn("GEMINI_429", { model: modelId, attempt, delay });
        if (attempt >= maxRetries - 1) {
          throw handleQuotaError(modelId, delay);
        }
        startCooldown(modelId);
        await sleep(delay);
        attempt += 1;
        continue;
      }
      console.error("GEMINI_ANALYSIS_FAILURE", { model: modelId, status });
      throw error;
    }
  }
  throw new GeminiQuotaError("QUOTA", "Gemini retries exhausted");
};

const summarizeIfNeeded = async (
  model: GenerativeModel,
  modelId: string,
  text: string,
  maxTokens: number,
  maxRetries: number,
): Promise<string> => {
  if (text.length <= MAX_CHARS) {
    return text;
  }
  const chunks = chunkText(text, CHUNK_SIZE);
  const summaries: string[] = [];
  for (const chunk of chunks) {
    const summary = await generateWithRetry(
      model,
      modelId,
      [{ role: "user", parts: [{ text: `${SUMMARY_PROMPT}\n\n${chunk}` }] }],
      maxTokens,
      maxRetries,
      0.3,
    );
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries.join("\n").slice(0, MAX_CHARS);
};

const runAnalysis = async (
  model: GenerativeModel,
  modelId: string,
  resume: string,
  maxTokens: number,
  maxRetries: number,
  enforceJson: boolean,
): Promise<string> => {
  const appendix = enforceJson ? "\nRespond with JSON only." : "";
  const prompt = `Resume text:\n${resume}${appendix}`;
  return generateWithRetry(
    model,
    modelId,
    [{ role: "user", parts: [{ text: prompt }] }],
    maxTokens,
    maxRetries,
    0.2,
  );
};

const shapeResult = (raw: unknown): GeminiAnalysis => {
  const data = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
  const toList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.length > 0) : [];
  const score = Number(data.overallScore);
  const bounded = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
  return {
    summary: typeof data.summary === "string" ? data.summary.trim() : "",
    strengths: toList(data.strengths),
    weaknesses: toList(data.weaknesses),
    overallScore: bounded,
  };
};

const parseGeminiJson = (payload: string): GeminiAnalysis | null => {
  try {
    return shapeResult(JSON.parse(payload));
  } catch (error) {
    console.warn("GEMINI_PARSE_ERROR", error);
    return null;
  }
};

export const analyzeWithGemini = async (text: string, opts?: GeminiOptions): Promise<GeminiAnalysis> => {
  const sanitized = sanitizeText(text);
  if (!sanitized) {
    return { summary: "", strengths: [], weaknesses: [], overallScore: 0 };
  }
  const modelId = opts?.model ?? DEFAULT_MODEL;
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxRetries = DEFAULT_MAX_RETRIES;
  const summaryModel = getModel(modelId);
  const analysisModel = getModel(modelId, SYSTEM_PROMPT);
  const prepared = await summarizeIfNeeded(summaryModel, modelId, sanitized, maxTokens, maxRetries);
  const first = parseGeminiJson(await runAnalysis(analysisModel, modelId, prepared, maxTokens, maxRetries, false));
  if (first) {
    return first;
  }
  const retry = parseGeminiJson(await runAnalysis(analysisModel, modelId, prepared, maxTokens, maxRetries, true));
  if (retry) {
    return retry;
  }
  throw new Error("Gemini returned an unreadable response");
};

const makeCacheKey = (cvId: string, keywords: readonly string[], model: string): string => {
  const normalized = [...keywords].map((item) => item.toLowerCase()).sort();
  return `${cvId}|${normalized.join(";")}|${model}`;
};

export const getGeminiCache = (cvId: string, keywords: readonly string[], model: string) => {
  const key = makeCacheKey(cvId, keywords, model);
  const entry = cacheStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  return entry.value;
};

export const setGeminiCache = (cvId: string, keywords: readonly string[], model: string, value: GeminiAnalysis) => {
  const key = makeCacheKey(cvId, keywords, model);
  cacheStore.delete(key);
  if (cacheStore.size >= CACHE_LIMIT) {
    const oldest = cacheStore.keys().next().value;
    if (oldest) {
      cacheStore.delete(oldest);
    }
  }
  cacheStore.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

export const isGeminiCoolingDown = (model: string): boolean => {
  const resumeAt = cooldownByModel.get(model) ?? 0;
  return resumeAt > Date.now();
};

export const resetGeminiState = (): void => {
  cooldownByModel.clear();
  cacheStore.clear();
};
