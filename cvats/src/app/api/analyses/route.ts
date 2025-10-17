import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import type { CvRecord } from "@/server/cv-repository";
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
import { signedRawUrl } from "@/server/cloudinary-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  requireEnv([
    "GOOGLE_GEMINI_API_KEY",
    "GEMINI_MODEL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "DATABASE_URL",
  ]);
}

const DEFAULT_KEYWORDS = ["javascript", "react", "node", "typescript", "nextjs"] as const;
const ANALYSIS_MAX_FILE_MB = Number.parseInt(process.env.ANALYSIS_MAX_FILE_MB ?? "10", 10) || 10;
const MAX_FILE_BYTES = ANALYSIS_MAX_FILE_MB * 1024 * 1024;

const postSchema = z.object({
  cvId: z.string().min(1),
  keywords: z.array(z.string().min(1)).optional(),
  __bytes: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
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

const isDocumentMime = (value: string | null | undefined): boolean =>
  /pdf|word|officedocument/i.test(value ?? "");

const deliveryUrlFromCv = (cv: CvRecord): string | null => {
  let url = cv.fileUrl || cv.secureUrl || "";
  if (!url) {
    return null;
  }
  if (isDocumentMime(cv.mimeType) && url.includes("/image/upload/")) {
    url = url.replace("/image/upload/", "/raw/upload/");
  }
  return url;
};

const extractVersionFromUrl = (url: string): number | undefined => {
  const match = url.match(/\/v(\d+)\//i);
  if (match) {
    const parsed = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

type HeadOutcome = {
  status: number;
  ok: boolean;
  contentLength: number | null;
};

const headForCloudinary = async (url: string): Promise<HeadOutcome> => {
  const response = await fetch(url, { method: "HEAD" });
  const lengthHeader = response.headers.get("content-length");
  const parsedLength = lengthHeader ? Number(lengthHeader) : null;
  const contentLength = parsedLength && Number.isFinite(parsedLength) && parsedLength > 0 ? parsedLength : null;
  return {
    status: response.status,
    ok: response.ok,
    contentLength,
  };
};

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

  const forceAuthenticatedDelivery =
    process.env.NODE_ENV !== "production" && request.headers.get("x-cloudinary-test") === "force-auth";

  const payload = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { cvId, keywords, __bytes: inlineBytesRaw, mimeType: inlineMimeTypeRaw } = parsed.data;
  const inlineBytes =
    typeof inlineBytesRaw === "string" && inlineBytesRaw.trim().length > 0 ? inlineBytesRaw.trim() : null;
  const inlineMimeType =
    typeof inlineMimeTypeRaw === "string" && inlineMimeTypeRaw.trim().length > 0
      ? inlineMimeTypeRaw.trim()
      : null;
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

  let fileDownload: { buffer: Buffer; mime: string | null } | null = null;
  let finalUrl: string | null = null;
  let remoteSize: number | null = null;

  if (inlineBytes) {
    const normalizedInline = inlineBytes.replace(/\s+/g, "");
    const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
    const isValidFormat = base64Pattern.test(normalizedInline) && normalizedInline.length % 4 === 0;
    if (!isValidFormat) {
      return NextResponse.json({ error: "INVALID_INLINE_BYTES" }, { status: 400 });
    }
    let inlineBuffer: Buffer;
    try {
      inlineBuffer = Buffer.from(normalizedInline, "base64");
    } catch (error) {
      console.error("ANALYSIS_INLINE_BYTES_INVALID_BASE64", {
        cvId,
        message: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({ error: "INVALID_INLINE_BYTES" }, { status: 400 });
    }
    if (!inlineBuffer || inlineBuffer.byteLength === 0) {
      return NextResponse.json({ error: "INVALID_INLINE_BYTES" }, { status: 400 });
    }
    remoteSize = inlineBuffer.byteLength;
    fileDownload = {
      buffer: inlineBuffer,
      mime: inlineMimeType ?? cv.mimeType ?? null,
    };
    logAnalysis("Using inline bytes for analysis", { cvId, size: inlineBuffer.byteLength });
  } else {
    const downloadUrl = deliveryUrlFromCv(cv);
    if (!downloadUrl) {
      console.error("ANALYSIS_CLOUDINARY_MISSING_URL", { cvId });
      return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
    }

    const publicHeadRaw = await headForCloudinary(downloadUrl);
    const publicHead = forceAuthenticatedDelivery
      ? { status: 403, ok: false, contentLength: null }
      : publicHeadRaw;
    console.log(`[analysis] cld public HEAD -> ${publicHead.status}`);
    finalUrl = downloadUrl;
    remoteSize = publicHead.contentLength;

    if (!(publicHead.ok && remoteSize && remoteSize > 0)) {
      try {
        if (!cv.publicId) {
          throw new Error("CLOUDINARY_PUBLIC_ID_MISSING");
        }
        const version =
          extractVersionFromUrl(downloadUrl) ??
          (cv.createdAtRaw && Number.isFinite(Number.parseInt(cv.createdAtRaw, 10))
            ? Number.parseInt(cv.createdAtRaw, 10)
            : undefined);
        const signedUrl = signedRawUrl(cv.publicId, version);
        finalUrl = signedUrl;
        const authHead = await headForCloudinary(signedUrl);
        console.log(`[analysis] cld auth HEAD -> ${authHead.status}`);
        if (!authHead.ok) {
          console.error("ANALYSIS_CLOUDINARY_AUTH_HEAD_FAILED", {
            cvId,
            status: authHead.status,
            url: signedUrl,
          });
          return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
        }
        if (authHead.ok && authHead.contentLength && authHead.contentLength > 0) {
          remoteSize = authHead.contentLength;
        } else {
          console.warn("[analysis] auth HEAD missing content-length", { cvId, status: authHead.status });
          remoteSize = authHead.contentLength ?? null;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "SIGNED_URL_FAILURE";
        console.error("ANALYSIS_CLOUDINARY_AUTH_FAILED", {
          cvId,
          url: downloadUrl,
          detail,
        });
        return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
      }
    } else {
      logAnalysis("Cloudinary HEAD ok", { cvId, url: downloadUrl, remoteSize });
    }

    if (typeof remoteSize === "number" && remoteSize > MAX_FILE_BYTES) {
      logAnalysis("Remote CV exceeds analysis size limit", { cvId, remoteSize });
      return NextResponse.json(
        { error: `File exceeds ${ANALYSIS_MAX_FILE_MB}MB analysis limit.` },
        { status: 413 },
      );
    }

    if (!finalUrl) {
      return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
    }

    try {
      fileDownload = await fetchCvBinary(finalUrl);
      logAnalysis("Fetched CV bytes", { cvId, size: fileDownload.buffer.byteLength, url: finalUrl });
    } catch (error) {
      console.error("ANALYSIS_CLOUDINARY_FETCH_FAILED", {
        cvId,
        url: finalUrl,
        message: (error as Error).message,
      });
      return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
    }
  }

  if (!fileDownload) {
    return NextResponse.json({ error: "CLOUDINARY_FETCH_FAILED" }, { status: 502 });
  }

  if (typeof remoteSize === "number" && remoteSize > MAX_FILE_BYTES) {
    logAnalysis("Remote CV exceeds analysis size limit", { cvId, remoteSize });
    return NextResponse.json(
      { error: `File exceeds ${ANALYSIS_MAX_FILE_MB}MB analysis limit.` },
      { status: 413 },
    );
  }

  const keywordList = mapKeywords(keywords);

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
