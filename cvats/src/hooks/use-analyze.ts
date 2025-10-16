import { useCallback, useState } from "react";
import Swal from "sweetalert2";

export interface AnalysisResult {
  id: string;
  cvId: string;
  atsScore: number;
  feedback: {
    positive: string[];
    improvements: string[];
  };
  keywords: {
    extracted: string[];
    missing: string[];
  };
  createdAt: string;
  usedFallback: boolean;
  fallbackReason: "QUOTA" | "PARSE" | "EMPTY" | "EMPTY_PROD" | "SAFETY" | null;
}

export type AnalysisStatus = "idle" | "running" | "error";

const parseResponse = async (
  response: Response,
): Promise<{ analysis?: AnalysisResult; error?: string }> => {
  try {
    const data = (await response.json()) as { analysis?: AnalysisResult; error?: string };
    return data;
  } catch {
    return {};
  }
};

const firstLine = (items: string[]): string | null => {
  const [primary] = items.filter((item) => item.trim().length > 0);
  return primary ?? null;
};

const summaryFromAnalysis = (analysis: AnalysisResult): string => {
  const positive = firstLine(analysis.feedback.positive);
  if (positive) {
    return positive;
  }
  const extracted = firstLine(analysis.keywords.extracted);
  if (extracted) {
    return `Detected keyword: ${extracted}`;
  }
  return analysis.usedFallback ? "Returned basic keyword scoring." : "Analysis complete.";
};

export const useAnalyze = (cvId: string) => {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);

  const analyze = useCallback(
    async (keywords?: string[]) => {
      setStatus("running");
      setError(null);

      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ cvId, keywords }),
      }).catch(() => null);

      if (!response) {
        setStatus("error");
        setError("Failed to reach analysis service.");
        return;
      }

      const payload = await parseResponse(response);
      if (!response.ok || !payload.analysis) {
        setStatus("error");
        setError(payload.error ?? "Analysis failed.");
        return;
      }

      console.log("ANALYZE_RESPONSE", payload.analysis);

      const fallbackReasonValue =
        payload.analysis.fallbackReason === "QUOTA" ||
        payload.analysis.fallbackReason === "PARSE" ||
        payload.analysis.fallbackReason === "EMPTY" ||
        payload.analysis.fallbackReason === "EMPTY_PROD" ||
        payload.analysis.fallbackReason === "SAFETY"
          ? payload.analysis.fallbackReason
          : null;

      const analysis: AnalysisResult = {
        ...payload.analysis,
        feedback: {
          positive: payload.analysis.feedback?.positive ?? [],
          improvements: payload.analysis.feedback?.improvements ?? [],
        },
        keywords: {
          extracted: payload.analysis.keywords?.extracted ?? [],
          missing: payload.analysis.keywords?.missing ?? [],
        },
        usedFallback: payload.analysis.usedFallback ?? false,
        fallbackReason: fallbackReasonValue,
      };
      setAnalyses((current) => [analysis, ...current]);
      setStatus("idle");
      const matchedSummary = summaryFromAnalysis(analysis);
      void Swal.fire({
        title: "Analysis complete",
        text: matchedSummary,
        icon: "success",
        confirmButtonText: "Great",
        timer: 1500,
        showConfirmButton: false,
      });
    },
    [cvId],
  );

  return {
    status,
    error,
    analyses,
    analyze,
  };
};
