import { describe, expect, it } from "vitest";
import { scoreKeywords } from "@/server/analysis/score";

const KEYWORDS = ["javascript", "react", "node", "typescript", "nextjs"] as const;

describe("scoreKeywords", () => {
  it("returns 0 score when no keywords match", () => {
    const { score, keywordsMatched } = scoreKeywords("plain text", KEYWORDS);
    expect(score).toBe(0);
    expect(keywordsMatched).toEqual([]);
  });

  it("is case-insensitive and ignores duplicates", () => {
    const input = "React react React and TypeScript are great";
    const { score, keywordsMatched } = scoreKeywords(input, KEYWORDS);
    expect(score).toBe(40);
    expect(keywordsMatched).toEqual(["react", "typescript"]);
  });

  it("handles empty keyword list", () => {
    const result = scoreKeywords("anything", []);
    expect(result).toEqual({ score: 0, keywordsMatched: [] });
  });

  it("returns full score when all keywords appear", () => {
    const input = KEYWORDS.join(" ");
    const { score } = scoreKeywords(input, KEYWORDS);
    expect(score).toBe(100);
  });
});
