const isMissing = (value: string | undefined): boolean => {
  if (typeof value !== "string") {
    return true;
  }
  return value.trim().length === 0;
};

export const requireEnv = (names: string[]): void => {
  const missing = names.filter((name) => isMissing(process.env[name]));
  if (missing.length > 0) {
    const detail = missing.join(", ");
    throw new Error(`Missing required environment variables: ${detail}`);
  }
};
