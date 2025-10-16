import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import { analysisRepository } from "@/server/analysis-repository";
import { extractTextFromFile } from "@/server/analysis/text-extractor";
import { scoreKeywords } from "@/server/analysis/score";
import {
  analyzeWithGemini,
  GeminiQuotaError,
  getGeminiCache,
  setGeminiCache,
  isGeminiCoolingDown,
} from "@/server/analysis/gemini";
import { checkRateLimit } from "@/server/rate-limit";
import { getAuthSession } from "@/lib/auth/session";

const DEFAULT_KEYWORDS = ["javascript", "react", "node", "typescript", "nextjs"] as const;

const postSchema = z.object({
  cvId: z.string().min(1),
  keywords: z.array(z.string().min(1)).optional(),
});

const mapKeywords = (keywords?: string[]): string[] => {
  if (!keywords || keywords.length === 0) {
    return [...DEFAULT_KEYWORDS];
  }
  return keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
};

const resolveModel = () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit(`analysis:${session.user.id}`)) {
    return NextResponse.json({ error: "Rate limit exceeded. Please wait before retrying." }, { status: 429 });
  }
  const json = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { cvId, keywords } = parsed.data;
  const cv = await cvRepository.findById(cvId);
  if (!cv || cv.userId !== session.user.id) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  const keywordList = mapKeywords(keywords);
  let extractedText = "";
  let message: string | null = null;

  try {
    extractedText = await extractTextFromFile(cv.fileUrl, cv.mimeType);
  } catch (error) {
    message = error instanceof Error ? error.message : "Failed to read file";
  }

  const trimmed = extractedText.trim();
  const modelId = resolveModel();
  const hasGemini = Boolean(process.env.GOOGLE_GEMINI_API_KEY);
  const keywordOutcome =
    trimmed.length === 0
      ? { score: 0, keywordsMatched: [] }
      : scoreKeywords(trimmed, keywordList);
  const unmatchedKeywords = keywordList.filter(
    (keyword) => !keywordOutcome.keywordsMatched.includes(keyword),
  );

  let summary = "";
  let strengths: string[] = [];
  let weaknesses: string[] = [];
  let score: number | null = keywordOutcome.score;
  let infoMessage = message;
  let usedFallback = false;
  let fallbackReason: string | null = null;

  if (trimmed.length === 0) {
    infoMessage = infoMessage ?? "No readable text was found in this file.";
    weaknesses = keywordList;
  } else if (hasGemini) {
    const cached = getGeminiCache(cvId, keywordList, modelId);
    if (cached) {
      summary = cached.summary;
      strengths = cached.strengths.length > 0 ? cached.strengths : keywordOutcome.keywordsMatched;
      weaknesses = cached.weaknesses.length > 0 ? cached.weaknesses : unmatchedKeywords;
      score = cached.overallScore;
    } else if (isGeminiCoolingDown(modelId)) {
      usedFallback = true;
      fallbackReason = "COOLDOWN";
      strengths = keywordOutcome.keywordsMatched;
      weaknesses = unmatchedKeywords;
      infoMessage = "Using basic analysis while AI service cools down.";
    } else {
      try {
        const aiResult = await analyzeWithGemini(trimmed, { model: modelId });
        summary = aiResult.summary;
        strengths = aiResult.strengths.length > 0 ? aiResult.strengths : keywordOutcome.keywordsMatched;
        weaknesses = aiResult.weaknesses.length > 0 ? aiResult.weaknesses : unmatchedKeywords;
        score = aiResult.overallScore;
        setGeminiCache(cvId, keywordList, modelId, aiResult);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          usedFallback = true;
          fallbackReason = error.reason;
          strengths = keywordOutcome.keywordsMatched;
          weaknesses = unmatchedKeywords;
          score = keywordOutcome.score;
          infoMessage =
            error.reason === "QUOTA"
              ? "Using basic analysis due to AI quota limits."
              : "Using basic analysis while AI service cools down.";
        } else {
          console.error("GEMINI_UNEXPECTED_ERROR", { model: modelId });
          usedFallback = true;
          fallbackReason = "ERROR";
          strengths = keywordOutcome.keywordsMatched;
          weaknesses = unmatchedKeywords;
          score = keywordOutcome.score;
          infoMessage = "Using basic analysis due to AI availability.";
        }
      }
    }
  } else {
    strengths = keywordOutcome.keywordsMatched;
    weaknesses = unmatchedKeywords;
  }

  const created = await analysisRepository.create({
    cvId,
    score,
    summary: summary || null,
    strengths,
    weaknesses,
    keywordsMatched: keywordOutcome.keywordsMatched,
    message: infoMessage,
    usedFallback,
    fallbackReason,
  });

  return NextResponse.json(
    {
      analysis: {
        id: created.id,
        cvId: created.cvId,
        score: created.score,
        summary: created.summary,
        strengths: created.strengths,
        weaknesses: created.weaknesses,
        keywordsMatched: created.keywordsMatched,
        message: created.message,
        usedFallback: created.usedFallback,
        fallbackReason: created.fallbackReason,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
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
    return NextResponse.json({ analyses: [] }, { status: 200 });
  }

  const analyses = await analysisRepository.listByCvId(cvId);
  return NextResponse.json({ analyses }, { status: 200 });
}
