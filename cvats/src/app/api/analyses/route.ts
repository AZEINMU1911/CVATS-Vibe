import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import {
  analysisRepository,
  type AnalysisHistoryRecord,
} from "@/server/analysis-repository";
import {
  analyzeWithGeminiFile,
  GeminiParseError,
  GeminiQuotaError,
  type GeminiFileAnalysis,
} from "@/server/analysis/gemini";
import { extractTextFromBuffer } from "@/server/analysis/text-extractor";
import { scoreKeywords } from "@/server/analysis/score";
import { checkRateLimit } from "@/server/rate-limit";
import { getAuthSession } from "@/lib/auth/session";
import { requireEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  requireEnv([
    "GOOGLE_GEMINI_API_KEY",
    "GEMINI_MODEL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_UPLOAD_PRESET",
    "DATABASE_URL",
  ]);
}

const DEFAULT_KEYWORDS = ["javascript", "react", "node", "typescript", "nextjs"] as const;
const ANALYSIS_MAX_FILE_MB = Number.parseInt(process.env.ANALYSIS_MAX_FILE_MB ?? "10", 10) || 10;
const MAX_FILE_BYTES = ANALYSIS_MAX_FILE_MB * 1024 * 1024;

const postSchema = z.object({
  cvId: z.string().min(1),
  keywords: z.array(z.string().min(1)).optional(),
});

const logAnalysis = (...values: unknown[]) => {
  if (isProduction) return;
  console.log("[analysis]", ...values);
};

const hasGeminiKey = (): boolean => Boolean(process.env.GOOGLE_GEMINI_API_KEY?.trim());

type FallbackReason = "QUOTA" | "PARSE" | "EMPTY" | "EMPTY_PROD" | "SAFETY";

interface ApiAnalysisResponse extends GeminiFileAnalysis {
  id: string;
  cvId: string;
  createdAt: string;
  usedFallback: boolean;
  fallbackReason: FallbackReason | null;
}

const mapKeywords = (keywords?: string[]): string[] => {
  if (!keywords || keywords.length === 0) {
    return [...DEFAULT_KEYWORDS];
  }
  return keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
};

const asFallbackReason = (value: string | null): FallbackReason | null => {
  if (
    value === "QUOTA" ||
    value === "PARSE" ||
    value === "EMPTY" ||
    value === "EMPTY_PROD" ||
    value === "SAFETY"
  ) {
    return value;
  }
  return null;
};

const toApiResponse = (record: AnalysisHistoryRecord): ApiAnalysisResponse => ({
  id: record.id,
  cvId: record.cvId,
  atsScore: record.atsScore,
  feedback: record.feedback,
  keywords: record.keywords,
  createdAt: record.createdAt,
  usedFallback: record.usedFallback,
  fallbackReason: asFallbackReason(record.fallbackReason),
});

const fetchCvBinary = async (url: string): Promise<{ buffer: Buffer; mime: string | null }> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download CV (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mime: response.headers.get("content-type"),
  };
};

const buildFallbackAnalysis = async (input: {
  buffer: Buffer;
  mimeType: string;
  keywords: readonly string[];
}): Promise<GeminiFileAnalysis> => {
  const text = await extractTextFromBuffer(input.buffer, input.mimeType);
  const outcome = scoreKeywords(text, input.keywords);
  const missing = input.keywords.filter((keyword) => !outcome.keywordsMatched.includes(keyword));
  return {
    atsScore: outcome.score,
    feedback: {
      positive: outcome.keywordsMatched.length
        ? outcome.keywordsMatched.map((keyword) => `Mentions ${keyword}`)
        : ["No target keywords detected."],
      improvements: missing.length
        ? missing.map((keyword) => `Consider highlighting ${keyword}`)
        : ["No obvious keyword gaps detected."],
    },
    keywords: {
      extracted: outcome.keywordsMatched,
      missing,
    },
  };
};

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  logAnalysis("POST received", { userId: session.user.id });
  if (!checkRateLimit(`analysis:${session.user.id}`)) {
    return NextResponse.json({ error: "Rate limit exceeded. Please wait before retrying." }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { cvId, keywords } = parsed.data;
  const cv = await cvRepository.findById(cvId);
  if (!cv || cv.userId !== session.user.id) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  if (cv.fileSize > MAX_FILE_BYTES) {
    logAnalysis("Stored CV exceeds analysis size limit", { cvId, size: cv.fileSize });
    return NextResponse.json(
      { error: `File exceeds ${ANALYSIS_MAX_FILE_MB}MB analysis limit.` },
      { status: 413 },
    );
  }

  const keywordList = mapKeywords(keywords);
  let fileDownload: { buffer: Buffer; mime: string | null };
  try {
    fileDownload = await fetchCvBinary(cv.fileUrl);
    logAnalysis("Fetched CV bytes", { cvId, size: fileDownload.buffer.byteLength });
  } catch {
    logAnalysis("Failed downloading CV", { cvId });
    return NextResponse.json({ error: "Unable to download CV file from storage." }, { status: 502 });
  }

  if (fileDownload.buffer.byteLength > MAX_FILE_BYTES) {
    logAnalysis("CV exceeds analysis size limit", { cvId, size: fileDownload.buffer.byteLength });
    return NextResponse.json(
      { error: `File exceeds ${ANALYSIS_MAX_FILE_MB}MB analysis limit.` },
      { status: 413 },
    );
  }

  const mimeType = fileDownload.mime ?? cv.mimeType ?? "application/pdf";
  let geminiResult: GeminiFileAnalysis | null = null;
  let fallbackReason: FallbackReason | null = null;

  if (hasGeminiKey()) {
    try {
      geminiResult = await analyzeWithGeminiFile({ file: fileDownload.buffer, mime: mimeType });
      logAnalysis("Gemini response parsed", { cvId, atsScore: geminiResult.atsScore });
    } catch (error) {
      if (error instanceof GeminiQuotaError) {
        fallbackReason = "QUOTA";
        logAnalysis("Gemini quota fallback", { cvId, retryAt: error.retryAt ?? null });
      } else if (error instanceof GeminiParseError) {
        if (error.code === "EMPTY_OR_NON_JSON") {
          fallbackReason = "EMPTY";
        } else if (error.code === "EMPTY_PROD") {
          fallbackReason = "EMPTY_PROD";
        } else if (error.code === "SAFETY_REJECTION") {
          fallbackReason = "SAFETY";
        } else {
          fallbackReason = "PARSE";
        }
        logAnalysis("Gemini parse fallback", { cvId, code: error.code });
      } else {
        console.error("ANALYSIS_GEMINI_ERROR", { message: (error as Error)?.message ?? "unknown" });
        fallbackReason = "PARSE";
        logAnalysis("Gemini unexpected error fallback", { cvId });
      }
    }
  } else {
    fallbackReason = "PARSE";
    logAnalysis("Gemini API key missing, using fallback", { cvId });
  }

  const result =
    geminiResult && !fallbackReason
      ? geminiResult
      : await buildFallbackAnalysis({ buffer: fileDownload.buffer, mimeType, keywords: keywordList });

  if (!geminiResult) {
    fallbackReason = fallbackReason ?? "PARSE";
  }

  const usedFallback = fallbackReason !== null;
  const created = await analysisRepository.create({
    cvId,
    userId: session.user.id,
    atsScore: result.atsScore,
    feedback: result.feedback,
    keywords: result.keywords,
    usedFallback,
    fallbackReason: usedFallback ? fallbackReason : null,
  });

  await cvRepository.updateAnalysisMeta(cvId, {
    atsScore: result.atsScore,
    analyzedAt: new Date(),
  });

  logAnalysis("Analysis stored", {
    analysisId: created.id,
    cvId,
    userId: session.user.id,
    atsScore: result.atsScore,
    usedFallback,
    fallbackReason,
  });

  return NextResponse.json({ analysis: toApiResponse(created) }, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cvId = searchParams.get("cvId");
  if (!cvId) {
    return NextResponse.json({ error: "cvId query param is required" }, { status: 400 });
  }

  const cv = await cvRepository.findById(cvId);
  if (!cv || cv.userId !== session.user.id) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  const history = await analysisRepository.findLatestForCv(cvId, session.user.id);
  if (!history) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  logAnalysis("Latest analysis fetched", { cvId, userId: session.user.id, analysisId: history.id });

  return NextResponse.json({ analysis: toApiResponse(history) }, { status: 200 });
}
