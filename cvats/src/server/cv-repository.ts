import { randomUUID } from "node:crypto";
import type { CV } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export interface CvRecord {
  id: string;
  userId?: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  publicId?: string | null;
}

export interface CreateCvInput {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  publicId?: string | null;
}

export interface CvRepository {
  listForUser(userId: string): Promise<CvRecord[]>;
  createForUser(userId: string, input: CreateCvInput): Promise<CvRecord>;
  findById(id: string): Promise<CvRecord | null>;
  deleteById(id: string, userId: string): Promise<boolean>;
  listPage(userId: string, limit: number, cursor?: string): Promise<{ items: CvRecord[]; nextCursor?: string | null }>;
  reset?: () => void;
}

const shouldUseMemory =
  process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const mapCv = (record: CV): CvRecord => ({
  id: record.id,
  userId: record.userId,
  fileName: record.fileName,
  fileUrl: record.fileUrl,
  fileSize: record.fileSize,
  mimeType: record.mimeType,
  uploadedAt: record.uploadedAt.toISOString(),
  publicId: record.publicId,
});

const createPrismaRepository = (): CvRepository => {
  const prismaGlobal = globalThis as typeof globalThis & { prismaInstance?: PrismaClient };
  if (!prismaGlobal.prismaInstance) {
    prismaGlobal.prismaInstance = new PrismaClient();
  }
  const prisma = prismaGlobal.prismaInstance;

  return {
    async listForUser(userId) {
      const rows = await prisma.cV.findMany({
        where: { userId },
        orderBy: { uploadedAt: "desc" },
      });
      return rows.map(mapCv);
    },
    async createForUser(userId, input) {
      const created = await prisma.cV.create({
        data: {
          userId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          publicId: input.publicId ?? null,
        },
      });
      return mapCv(created);
    },
    async findById(id) {
      const record = await prisma.cV.findUnique({ where: { id } });
      return record ? mapCv(record) : null;
    },
    async deleteById(id, userId) {
      const existing = await prisma.cV.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        return false;
      }
      await prisma.cV.delete({ where: { id } });
      return true;
    },
    async listPage(userId, limit, cursor) {
      const query: Parameters<typeof prisma.cV.findMany>[0] = {
        where: { userId },
        orderBy: { uploadedAt: "desc" },
        take: limit + 1,
      };
      if (cursor) {
        query.cursor = { id: cursor };
        query.skip = 1;
      }
      const rows = await prisma.cV.findMany(query);
      const items = rows.slice(0, limit).map(mapCv);
      const nextItem = rows.length > limit ? rows[limit] : null;
      const nextCursor = nextItem?.id ?? null;
      return { items, nextCursor };
    },
  };
};

const createMemoryRepository = (): CvRepository => {
  const itemsByUser = new Map<string, CvRecord[]>();

  return {
    async listForUser(userId) {
      const items = itemsByUser.get(userId) ?? [];
      return [...items];
    },
    async createForUser(userId, input) {
      const record: CvRecord = {
        id: randomUUID(),
        userId,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedAt: new Date().toISOString(),
        publicId: input.publicId ?? null,
      };
      const nextItems = itemsByUser.get(userId) ?? [];
      itemsByUser.set(userId, [record, ...nextItems]);
      return record;
    },
    async findById(id) {
      for (const list of itemsByUser.values()) {
        const match = list.find((item) => item.id === id);
        if (match) {
          return match;
        }
      }
      return null;
    },
    async deleteById(id, userId) {
      const items = itemsByUser.get(userId);
      if (!items) {
        return false;
      }
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        return false;
      }
      items.splice(index, 1);
      return true;
    },
    async listPage(userId, limit, cursor) {
      const items = itemsByUser.get(userId) ?? [];
      const startIndex = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0;
      const safeStart = startIndex < 0 ? 0 : startIndex;
      const page = items.slice(safeStart, safeStart + limit);
      const nextItem = items[safeStart + limit];
      return {
        items: page,
        nextCursor: nextItem?.id ?? null,
      };
    },
    reset() {
      itemsByUser.clear();
    },
  };
};

export const cvRepository: CvRepository = shouldUseMemory
  ? createMemoryRepository()
  : createPrismaRepository();

export const resetCvRepository = (): void => {
  cvRepository.reset?.();
};

export const getRepositoryMode = (): "memory" | "prisma" =>
  shouldUseMemory ? "memory" : "prisma";
