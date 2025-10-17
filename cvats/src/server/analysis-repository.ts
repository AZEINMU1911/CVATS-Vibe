import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/server/prisma-client";

export interface AnalysisRecord {
  id: string;
  cvId: string;
  userId: string;
  atsScore: number;
  feedback: {
    positive: string[];
    improvements: string[];
  };
  keywords: {
    extracted: string[];
    missing: string[];
  };
  usedFallback: boolean;
  fallbackReason: string | null;
  createdAt: string;
}

export interface CreateAnalysisInput {
  cvId: string;
  userId: string;
  atsScore: number;
  feedback: {
    positive: string[];
    improvements: string[];
  };
  keywords: {
    extracted: string[];
    missing: string[];
  };
  usedFallback?: boolean;
  fallbackReason?: string | null;
}

export interface AnalysisRepository {
  create(input: CreateAnalysisInput): Promise<AnalysisRecord>;
  findLatestForCv(cvId: string, userId: string): Promise<AnalysisRecord | null>;
  listByCvId(cvId: string, userId: string): Promise<AnalysisRecord[]>;
  reset?: () => void;
}

interface PrismaAnalysisEntity {
  id: string;
  cvId: string;
  userId: string;
  atsScore: number;
  feedback: unknown;
  keywords: unknown;
  usedFallback: boolean;
  fallbackReason: string | null;
  createdAt: Date;
}

const shouldUseMemory =
  process.env.NODE_ENV === "test" ||
  !process.env.DATABASE_URL ||
  (process.env.PRISMA_FORCE_MEMORY ?? "").toLowerCase() === "1" ||
  (process.env.PRISMA_FORCE_MEMORY ?? "").toLowerCase() === "true";

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.length > 0);
};

const mapFeedback = (value: unknown): AnalysisRecord["feedback"] => {
  if (typeof value !== "object" || !value) {
    return { positive: [], improvements: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    positive: toStringList(record.positive),
    improvements: toStringList(record.improvements),
  };
};

const mapKeywords = (value: unknown): AnalysisRecord["keywords"] => {
  if (typeof value !== "object" || !value) {
    return { extracted: [], missing: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    extracted: toStringList(record.extracted),
    missing: toStringList(record.missing),
  };
};

const mapAnalysis = (analysis: PrismaAnalysisEntity): AnalysisRecord => ({
  id: analysis.id,
  cvId: analysis.cvId,
  userId: analysis.userId,
  atsScore: analysis.atsScore,
  feedback: mapFeedback(analysis.feedback),
  keywords: mapKeywords(analysis.keywords),
  usedFallback: analysis.usedFallback,
  fallbackReason: analysis.fallbackReason ?? null,
  createdAt: analysis.createdAt.toISOString(),
});

const createPrismaRepository = (): AnalysisRepository => {
  const prismaGlobal = globalThis as typeof globalThis & { prismaInstance?: PrismaClient };
  if (!prismaGlobal.prismaInstance) {
    prismaGlobal.prismaInstance = createPrismaClient();
  }
  const prisma = prismaGlobal.prismaInstance;

  return {
    async create(input) {
      const created = (await prisma.analysisHistory.create({
        data: {
          cvId: input.cvId,
          userId: input.userId,
          atsScore: input.atsScore,
          feedback: input.feedback,
          keywords: input.keywords,
          usedFallback: input.usedFallback ?? false,
          fallbackReason: input.fallbackReason ?? null,
        },
      })) as unknown as PrismaAnalysisEntity;
      return mapAnalysis(created);
    },
    async findLatestForCv(cvId, userId) {
      const record = (await prisma.analysisHistory.findFirst({
        where: { cvId, userId },
        orderBy: { createdAt: "desc" },
      })) as unknown as PrismaAnalysisEntity | null;
      return record ? mapAnalysis(record) : null;
    },
    async listByCvId(cvId, userId) {
      const rows = (await prisma.analysisHistory.findMany({
        where: { cvId, userId },
        orderBy: { createdAt: "desc" },
      })) as unknown as PrismaAnalysisEntity[];
      return rows.map(mapAnalysis);
    },
  };
};

const createMemoryRepository = (): AnalysisRepository => {
  const store = new Map<string, AnalysisRecord[]>();
  let counter = 0;

  return {
    async create(input) {
      const entry: AnalysisRecord = {
        id: `${Date.now()}-${counter++}`,
        cvId: input.cvId,
        userId: input.userId,
        atsScore: input.atsScore,
        feedback: {
          positive: [...input.feedback.positive],
          improvements: [...input.feedback.improvements],
        },
        keywords: {
          extracted: [...input.keywords.extracted],
          missing: [...input.keywords.missing],
        },
        usedFallback: input.usedFallback ?? false,
        fallbackReason: input.fallbackReason ?? null,
        createdAt: new Date().toISOString(),
      };
      const existing = store.get(input.cvId) ?? [];
      store.set(input.cvId, [entry, ...existing]);
      return entry;
    },
    async findLatestForCv(cvId, userId) {
      const current = store.get(cvId);
      if (!current) return null;
      return current.find((item) => item.userId === userId) ?? null;
    },
    async listByCvId(cvId, userId) {
      const current = store.get(cvId) ?? [];
      return current.filter((item) => item.userId === userId);
    },
    reset() {
      store.clear();
    },
  };
};

export const analysisRepository: AnalysisRepository = shouldUseMemory
  ? createMemoryRepository()
  : createPrismaRepository();

export const resetAnalysisRepository = (): void => {
  analysisRepository.reset?.();
};
