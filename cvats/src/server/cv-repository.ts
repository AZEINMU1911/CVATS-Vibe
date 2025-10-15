import { randomUUID } from "node:crypto";
import type { CV } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export interface CvRecord {
  id: string;
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
  reset?: () => void;
}

export const STUB_USER_ID = "000000000000000000000000";

const shouldUseMemory =
  process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const mapCv = (record: CV): CvRecord => ({
  id: record.id,
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
