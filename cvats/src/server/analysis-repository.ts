import type { Analysis } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export interface AnalysisRecord {
  id: string;
  cvId: string;
  score: number | null;
  keywordsMatched: string[];
  createdAt: string;
  message?: string | null;
}

export interface CreateAnalysisInput {
  cvId: string;
  score: number | null;
  keywordsMatched: string[];
  message?: string | null;
}

export interface AnalysisRepository {
  create(input: CreateAnalysisInput): Promise<AnalysisRecord>;
  listByCvId(cvId: string): Promise<AnalysisRecord[]>;
  reset?: () => void;
}

const shouldUseMemory = process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const mapAnalysis = (analysis: Analysis): AnalysisRecord => {
  const insights = (analysis.insights as { keywordsMatched?: unknown }) ?? {};
  const keywordsMatched = Array.isArray(insights.keywordsMatched)
    ? (insights.keywordsMatched as string[])
    : [];

  return {
    id: analysis.id,
    cvId: analysis.cvId,
    score: analysis.score,
    keywordsMatched,
    createdAt: analysis.createdAt.toISOString(),
    message: analysis.summary,
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
          summary: input.message ?? null,
          insights: {
            keywordsMatched: input.keywordsMatched,
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
        keywordsMatched: [...input.keywordsMatched],
        createdAt: new Date().toISOString(),
        message: input.message ?? null,
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
