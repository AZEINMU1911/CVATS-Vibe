import { compare, hash } from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, 12);
};

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> => {
  return compare(password, passwordHash);
};

export const validatePassword = (
  password: string,
): { ok: true } | { ok: false; error: string } => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return { ok: false, error: "Password must include letters and numbers." };
  }

  return { ok: true };
};
