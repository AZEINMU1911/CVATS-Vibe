import { randomUUID } from "node:crypto";
import type { CV } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "@/server/env";

export interface CvRecord {
  id: string;
  userId?: string;
  fileName: string;
  secureUrl: string;
  fileUrl?: string | null;
  fileSize: number;
  bytes?: number | null;
  mimeType: string;
  format?: string | null;
  uploadedAt: string;
  publicId?: string | null;
  resourceType?: string | null;
  accessMode?: string | null;
  type?: string | null;
  originalFilename?: string | null;
  createdAtRaw?: string | null;
  atsScore?: number | null;
  analyzedAt?: string | null;
}

export interface CreateCvInput {
  fileName: string;
  secureUrl?: string | null;
  publicId: string;
  resourceType: string;
  accessMode: string;
  type: string;
  fileSize: number;
  mimeType: string;
  bytes?: number | null;
  format?: string | null;
  originalFilename?: string | null;
  createdAtRaw?: string | null;
  legacyFileUrl?: string | null;
}

export interface CvRepository {
  listForUser(userId: string): Promise<CvRecord[]>;
  createForUser(userId: string, input: CreateCvInput): Promise<CvRecord>;
  findById(id: string): Promise<CvRecord | null>;
  deleteById(id: string, userId: string): Promise<boolean>;
  listPage(userId: string, limit: number, cursor?: string): Promise<{ items: CvRecord[]; nextCursor?: string | null }>;
  updateAnalysisMeta(cvId: string, input: { atsScore: number; analyzedAt: Date }): Promise<void>;
  reset?: () => void;
}

const shouldUseMemory =
  process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production") {
  requireEnv(["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"]);
}

const mapCv = (record: CV): CvRecord => {
  const normalizedSecureUrl = typeof record.secureUrl === "string" && record.secureUrl.trim().length > 0
    ? record.secureUrl
    : null;
  const normalizedFileUrl = typeof record.fileUrl === "string" && record.fileUrl.trim().length > 0
    ? record.fileUrl
    : null;

  return {
    id: record.id,
    userId: record.userId,
    fileName: record.fileName,
    secureUrl: normalizedSecureUrl ?? normalizedFileUrl ?? "",
    fileUrl: normalizedFileUrl,
    fileSize: record.fileSize,
    bytes: record.bytes ?? null,
    mimeType: record.mimeType,
    format: record.format ?? null,
    uploadedAt: record.uploadedAt.toISOString(),
    publicId: record.publicId ?? null,
    resourceType: record.resourceType ?? null,
    accessMode: record.accessMode ?? null,
    type: record.type ?? null,
    originalFilename: record.originalFilename ?? null,
    createdAtRaw: record.createdAtRaw ?? null,
    atsScore: record.atsScore ?? null,
    analyzedAt: record.analyzedAt ? record.analyzedAt.toISOString() : null,
  };
};

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
          secureUrl: input.secureUrl ?? null,
          publicId: input.publicId,
          resourceType: input.resourceType,
          accessMode: input.accessMode,
          type: input.type,
          fileUrl: input.legacyFileUrl ?? null,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          bytes: input.bytes ?? null,
          format: input.format ?? null,
          originalFilename: input.originalFilename ?? null,
          createdAtRaw: input.createdAtRaw ?? null,
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
    async updateAnalysisMeta(cvId, input) {
      await prisma.cV.update({
        where: { id: cvId },
        data: {
          atsScore: input.atsScore,
          analyzedAt: input.analyzedAt,
        },
      });
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
        secureUrl: input.secureUrl ?? input.legacyFileUrl ?? "",
        fileUrl: input.legacyFileUrl ?? null,
        fileSize: input.fileSize,
        bytes: input.bytes ?? null,
        mimeType: input.mimeType,
        format: input.format ?? null,
        uploadedAt: new Date().toISOString(),
        publicId: input.publicId,
        resourceType: input.resourceType,
        accessMode: input.accessMode,
        type: input.type,
        originalFilename: input.originalFilename ?? null,
        createdAtRaw: input.createdAtRaw ?? null,
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
    async updateAnalysisMeta(cvId, input) {
      for (const [userId, items] of itemsByUser.entries()) {
        const index = items.findIndex((item) => item.id === cvId);
        if (index === -1) continue;
        const record = items[index];
        if (!record) {
          continue;
        }
        record.atsScore = input.atsScore;
        record.analyzedAt = input.analyzedAt.toISOString();
        itemsByUser.set(userId, items);
        break;
      }
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
