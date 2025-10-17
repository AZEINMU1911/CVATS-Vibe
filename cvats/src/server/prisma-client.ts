import type { PrismaClient as PrismaClientType } from "@prisma/client";

type PrismaClientConstructor = new () => PrismaClientType;

let prismaCtor: PrismaClientConstructor | null = null;

const loadPrismaConstructor = (): PrismaClientConstructor => {
  if (prismaCtor) {
    return prismaCtor;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require("@prisma/client") as { PrismaClient: PrismaClientConstructor };
    if (!mod?.PrismaClient) {
      throw new Error("PRISMA_CLIENT_EXPORT_MISSING");
    }
    prismaCtor = mod.PrismaClient;
  } catch (error) {
    console.error("PRISMA_CLIENT_IMPORT_FAILED", error);
    class MissingPrismaClient {
      constructor() {
        throw new Error("PRISMA_CLIENT_MISSING");
      }
    }
    prismaCtor = MissingPrismaClient as unknown as PrismaClientConstructor;
  }
  return prismaCtor;
};

export const createPrismaClient = (): PrismaClientType => {
  const ctor = loadPrismaConstructor();
  return new ctor();
};
