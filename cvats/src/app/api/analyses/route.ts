import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import { analysisRepository } from "@/server/analysis-repository";
import { extractTextFromFile } from "@/server/analysis/text-extractor";
import { scoreKeywords } from "@/server/analysis/score";
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

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const outcome =
    trimmed.length === 0
      ? { score: 0, keywordsMatched: [] }
      : scoreKeywords(trimmed, keywordList);

  if (trimmed.length === 0 && !message) {
    message = "No readable text was found in this file.";
  }

  const created = await analysisRepository.create({
    cvId,
    score: outcome.score,
    keywordsMatched: outcome.keywordsMatched,
    message,
  });

  return NextResponse.json(
    {
      analysis: {
        id: created.id,
        cvId: created.cvId,
        score: outcome.score,
        keywordsMatched: outcome.keywordsMatched,
        message,
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
