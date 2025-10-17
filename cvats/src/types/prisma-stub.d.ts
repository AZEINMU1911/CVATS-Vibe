declare module ".prisma/client/default" {
  export interface User {
    id: string;
    email: string;
    name: string | null;
    passwordHash: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface CV {
    id: string;
    userId: string;
    fileName: string;
    publicId: string;
    resourceType: string;
    accessMode: string;
    type: string;
    fileUrl: string | null;
    secureUrl: string | null;
    fileSize: number;
    mimeType: string;
    bytes: number | null;
    format: string | null;
    originalFilename: string | null;
    createdAtRaw: string | null;
    atsScore: number | null;
    analyzedAt: Date | null;
    uploadedAt: Date;
  }

  export interface Analysis {
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

  export type AnalysisHistory = Analysis;

  export class PrismaClient {
    constructor(): void;
    $disconnect(): Promise<void>;
    cV: {
      findMany: (args: Record<string, unknown>) => Promise<CV[]>;
      create: (args: Record<string, unknown>) => Promise<CV>;
      findUnique: (args: Record<string, unknown>) => Promise<CV | null>;
      delete: (args: Record<string, unknown>) => Promise<CV>;
      update: (args: Record<string, unknown>) => Promise<CV>;
    };
    analysisHistory: {
      create: (args: Record<string, unknown>) => Promise<AnalysisHistory>;
      findFirst: (args: Record<string, unknown>) => Promise<AnalysisHistory | null>;
      findMany: (args: Record<string, unknown>) => Promise<AnalysisHistory[]>;
    };
    analysis: {
      create: (args: Record<string, unknown>) => Promise<Analysis>;
      findFirst: (args: Record<string, unknown>) => Promise<Analysis | null>;
      findMany: (args: Record<string, unknown>) => Promise<Analysis[]>;
    };
    user: {
      findUnique: (args: Record<string, unknown>) => Promise<User | null>;
      create: (args: Record<string, unknown>) => Promise<User>;
    };
  }
}
