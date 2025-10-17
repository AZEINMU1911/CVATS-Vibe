import type { AnalysisHistory } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/server/prisma-client";

export interface AnalysisHistoryRecord {
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

export interface CreateAnalysisHistoryInput {
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

export interface AnalysisHistoryRepository {
  create(input: CreateAnalysisHistoryInput): Promise<AnalysisHistoryRecord>;
  findLatestForCv(cvId: string, userId: string): Promise<AnalysisHistoryRecord | null>;
  listByCvId(cvId: string, userId: string): Promise<AnalysisHistoryRecord[]>;
  reset?: () => void;
}

const shouldUseMemory = process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.length > 0);
};

const mapFeedback = (value: unknown): AnalysisHistoryRecord["feedback"] => {
  if (typeof value !== "object" || !value) {
    return { positive: [], improvements: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    positive: toStringList(record.positive),
    improvements: toStringList(record.improvements),
  };
};

const mapKeywords = (value: unknown): AnalysisHistoryRecord["keywords"] => {
  if (typeof value !== "object" || !value) {
    return { extracted: [], missing: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    extracted: toStringList(record.extracted),
    missing: toStringList(record.missing),
  };
};

const mapHistory = (history: AnalysisHistory): AnalysisHistoryRecord => ({
  id: history.id,
  cvId: history.cvId,
  userId: history.userId,
  atsScore: history.atsScore,
  feedback: mapFeedback(history.feedback),
  keywords: mapKeywords(history.keywords),
  usedFallback: history.usedFallback,
  fallbackReason: history.fallbackReason ?? null,
  createdAt: history.createdAt.toISOString(),
});

const createPrismaRepository = (): AnalysisHistoryRepository => {
  const prismaGlobal = globalThis as typeof globalThis & { prismaInstance?: PrismaClient };
  if (!prismaGlobal.prismaInstance) {
    prismaGlobal.prismaInstance = createPrismaClient();
  }
  const prisma = prismaGlobal.prismaInstance;

  return {
    async create(input) {
      const created = await prisma.analysisHistory.create({
        data: {
          cvId: input.cvId,
          userId: input.userId,
          atsScore: input.atsScore,
          feedback: input.feedback,
          keywords: input.keywords,
          usedFallback: input.usedFallback ?? false,
          fallbackReason: input.fallbackReason ?? null,
        },
      });
      return mapHistory(created);
    },
    async findLatestForCv(cvId, userId) {
      const record = await prisma.analysisHistory.findFirst({
        where: { cvId, userId },
        orderBy: { createdAt: "desc" },
      });
      return record ? mapHistory(record) : null;
    },
    async listByCvId(cvId, userId) {
      const rows = await prisma.analysisHistory.findMany({
        where: { cvId, userId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapHistory);
    },
  };
};

const createMemoryRepository = (): AnalysisHistoryRepository => {
  const store = new Map<string, AnalysisHistoryRecord[]>();
  let counter = 0;

  return {
    async create(input) {
      const entry: AnalysisHistoryRecord = {
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

export const analysisRepository: AnalysisHistoryRepository = shouldUseMemory
  ? createMemoryRepository()
  : createPrismaRepository();

export const resetAnalysisRepository = (): void => {
  analysisRepository.reset?.();
};
