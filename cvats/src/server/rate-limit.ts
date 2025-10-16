const WINDOW_MS = 60_000;
const LIMIT = 10;

const buckets = new Map<string, number[]>();

export const checkRateLimit = (key: string, limit = LIMIT, windowMs = WINDOW_MS): boolean => {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
};

export const resetRateLimit = (): void => {
  buckets.clear();
};
