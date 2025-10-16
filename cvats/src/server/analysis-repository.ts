import type { Analysis } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export interface AnalysisRecord {
  id: string;
  cvId: string;
  score: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  keywordsMatched: string[];
  createdAt: string;
  message?: string | null;
  usedFallback: boolean;
  fallbackReason: string | null;
}

export interface CreateAnalysisInput {
  cvId: string;
  score: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  keywordsMatched: string[];
  message?: string | null;
  usedFallback?: boolean;
  fallbackReason?: string | null;
}

export interface AnalysisRepository {
  create(input: CreateAnalysisInput): Promise<AnalysisRecord>;
  listByCvId(cvId: string): Promise<AnalysisRecord[]>;
  reset?: () => void;
}

const shouldUseMemory = process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const mapAnalysis = (analysis: Analysis): AnalysisRecord => {
  const insights = (analysis.insights as {
    keywordsMatched?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    message?: unknown;
    usedFallback?: unknown;
    fallbackReason?: unknown;
  }) ?? {};
  const toList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.length > 0) : [];
  const usedFallback = typeof insights.usedFallback === "boolean" ? insights.usedFallback : false;
  const fallbackReason =
    typeof insights.fallbackReason === "string" ? (insights.fallbackReason as string) : null;

  return {
    id: analysis.id,
    cvId: analysis.cvId,
    score: analysis.score,
    summary: typeof analysis.summary === "string" ? analysis.summary : null,
    strengths: toList(insights.strengths),
    weaknesses: toList(insights.weaknesses),
    keywordsMatched: toList(insights.keywordsMatched),
    createdAt: analysis.createdAt.toISOString(),
    message: typeof insights.message === "string" ? insights.message : null,
    usedFallback,
    fallbackReason,
  };
};

const createPrismaRepository = (): AnalysisRepository => {
  const prismaGlobal = globalThis as typeof globalThis & { prismaInstance?: PrismaClient };
  if (!prismaGlobal.prismaInstance) {
    prismaGlobal.prismaInstance = new PrismaClient();
  }
  const prisma = prismaGlobal.prismaInstance;

  return {
    async create(input) {
      const created = await prisma.analysis.create({
        data: {
          cvId: input.cvId,
          score: input.score,
          summary: input.summary ?? null,
          insights: {
            keywordsMatched: input.keywordsMatched,
            strengths: input.strengths,
            weaknesses: input.weaknesses,
            message: input.message ?? null,
            usedFallback: input.usedFallback ?? false,
            fallbackReason: input.fallbackReason ?? null,
          },
        },
      });
      return mapAnalysis(created);
    },
    async listByCvId(cvId) {
      const rows = await prisma.analysis.findMany({
        where: { cvId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapAnalysis);
    },
  };
};

const createMemoryRepository = (): AnalysisRepository => {
  const analyses = new Map<string, AnalysisRecord[]>();
  let counter = 0;

  return {
    async create(input) {
      const record: AnalysisRecord = {
        id: `${Date.now()}-${counter++}`,
        cvId: input.cvId,
        score: input.score,
        summary: input.summary ?? null,
        strengths: [...input.strengths],
        weaknesses: [...input.weaknesses],
        keywordsMatched: [...input.keywordsMatched],
        createdAt: new Date().toISOString(),
        message: input.message ?? null,
        usedFallback: input.usedFallback ?? false,
        fallbackReason: input.fallbackReason ?? null,
      };
      const existing = analyses.get(input.cvId) ?? [];
      analyses.set(input.cvId, [record, ...existing]);
      return record;
    },
    async listByCvId(cvId) {
      return analyses.get(cvId) ?? [];
    },
    reset() {
      analyses.clear();
    },
  };
};

export const analysisRepository: AnalysisRepository = shouldUseMemory
  ? createMemoryRepository()
  : createPrismaRepository();

export const resetAnalysisRepository = (): void => {
  analysisRepository.reset?.();
};
