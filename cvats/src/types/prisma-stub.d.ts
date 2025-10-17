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

  export interface AnalysisHistory {
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

  export class PrismaClient {
    constructor(): void;
    $disconnect(): Promise<void>;
    cV: {
      findMany: (...args: any[]) => Promise<CV[]>;
      create: (...args: any[]) => Promise<CV>;
      findUnique: (...args: any[]) => Promise<CV | null>;
      delete: (...args: any[]) => Promise<CV>;
      update: (...args: any[]) => Promise<CV>;
    };
    analysisHistory: {
      create: (...args: any[]) => Promise<AnalysisHistory>;
      findFirst: (...args: any[]) => Promise<AnalysisHistory | null>;
      findMany: (...args: any[]) => Promise<AnalysisHistory[]>;
    };
    user: {
      findUnique: (...args: any[]) => Promise<User | null>;
      create: (...args: any[]) => Promise<User>;
    };
  }
}
