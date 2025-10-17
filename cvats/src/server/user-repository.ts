import { randomBytes } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import { createPrismaClient } from "@/server/prisma-client";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash?: string | null;
  name?: string | null;
}

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  name?: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  reset?: () => void;
}

const shouldUseMemory = process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;

const mapUser = (user: User): UserRecord => ({
  id: user.id,
  email: user.email,
  passwordHash: user.passwordHash,
  name: user.name,
});

const createPrismaRepository = (): UserRepository => {
  const prismaGlobal = globalThis as typeof globalThis & { prismaInstance?: PrismaClient };
  if (!prismaGlobal.prismaInstance) {
    prismaGlobal.prismaInstance = createPrismaClient();
  }
  const prisma = prismaGlobal.prismaInstance;

  return {
    async findByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? mapUser(user) : null;
    },
    async findById(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? mapUser(user) : null;
    },
    async create(input) {
      const created = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash ?? null,
          name: input.name ?? null,
        },
      });
      return mapUser(created);
    },
  };
};

const createMemoryRepository = (): UserRepository => {
  const users = new Map<string, UserRecord>();

  return {
    async findByEmail(email) {
      for (const user of users.values()) {
        if (user.email === email) {
          return { ...user };
        }
      }
      return null;
    },
    async findById(id) {
      const user = users.get(id);
      return user ? { ...user } : null;
    },
    async create(input) {
      const id = randomBytes(12).toString("hex");
      const record: UserRecord = {
        id,
        email: input.email,
        passwordHash: input.passwordHash ?? null,
        name: input.name ?? null,
      };
      users.set(id, record);
      return { ...record };
    },
    reset() {
      users.clear();
    },
  };
};

export const userRepository: UserRepository = shouldUseMemory
  ? createMemoryRepository()
  : createPrismaRepository();

export const resetUserRepository = (): void => {
  userRepository.reset?.();
};
