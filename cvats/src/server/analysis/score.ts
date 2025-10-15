const clampScore = (value: number): number => {
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
};

export interface KeywordScore {
  score: number;
  keywordsMatched: string[];
}

const normalizeWord = (word: string): string => word.trim().toLowerCase();

export const scoreKeywords = (text: string, keywords: readonly string[]): KeywordScore => {
  const normalizedText = text.toLowerCase();
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const keyword of keywords) {
    const normalized = normalizeWord(keyword);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    if (normalizedText.includes(normalized)) {
      matches.push(keyword);
    }
  }

  if (keywords.length === 0) {
    return { score: 0, keywordsMatched: [] };
  }

  const ratio = matches.length / seen.size;
  return {
    score: clampScore(ratio * 100),
    keywordsMatched: matches,
  };
};
