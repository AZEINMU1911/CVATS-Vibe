import { randomBytes } from "node:crypto";
import { AUTH_COOKIE_NAME, DEFAULT_USER_EMAIL } from "@/lib/auth-constants";

const userIdByEmail = new Map<string, string>();

const parseCookies = (header: string | null): Record<string, string> => {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) {
      return acc;
    }
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

const generateObjectIdLike = (): string => randomBytes(12).toString("hex");

const ensureUserId = (email: string): string => {
  if (!userIdByEmail.has(email)) {
    userIdByEmail.set(email, generateObjectIdLike());
  }
  return userIdByEmail.get(email)!;
};

export const getCurrentUser = (request: Request): { id: string; email: string } => {
  const headerEmail = request.headers.get("x-user-email");
  if (headerEmail && headerEmail.includes("@")) {
    return { id: ensureUserId(headerEmail.toLowerCase()), email: headerEmail.toLowerCase() };
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const email = cookies[AUTH_COOKIE_NAME] ?? DEFAULT_USER_EMAIL;
  return { id: ensureUserId(email), email };
};

export const getUserIdByEmail = (email: string): string => ensureUserId(email);
