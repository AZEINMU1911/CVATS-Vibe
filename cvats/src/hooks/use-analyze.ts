import { useCallback, useState } from "react";
import Swal from "sweetalert2";
import type { InlineAnalysisPayload } from "@/types/analysis";

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
    async (options?: { keywords?: string[]; inline?: InlineAnalysisPayload | null }) => {
      setStatus("running");
      setError(null);

      const requestBody: Record<string, unknown> = { cvId };
      if (options?.keywords && options.keywords.length > 0) {
        requestBody.keywords = options.keywords;
      }
      if (options?.inline && options.inline.bytes.length > 0) {
        requestBody.__bytes = options.inline.bytes;
        if (options.inline.mimeType && options.inline.mimeType.length > 0) {
          requestBody.mimeType = options.inline.mimeType;
        }
      }

      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(requestBody),
      }).catch(() => null);

      if (!response) {
        setStatus("error");
        setError("Failed to reach analysis service.");
        return false;
      }

      const responsePayload = await parseResponse(response);
      if (!response.ok || !responsePayload.analysis) {
        setStatus("error");
        setError(responsePayload.error ?? "Analysis failed.");
        return false;
      }

      console.log("ANALYZE_RESPONSE", responsePayload.analysis);

      const fallbackReasonValue =
        responsePayload.analysis.fallbackReason === "QUOTA" ||
        responsePayload.analysis.fallbackReason === "PARSE" ||
        responsePayload.analysis.fallbackReason === "EMPTY" ||
        responsePayload.analysis.fallbackReason === "EMPTY_PROD" ||
        responsePayload.analysis.fallbackReason === "SAFETY"
          ? responsePayload.analysis.fallbackReason
          : null;

      const analysis: AnalysisResult = {
        ...responsePayload.analysis,
        feedback: {
          positive: responsePayload.analysis.feedback?.positive ?? [],
          improvements: responsePayload.analysis.feedback?.improvements ?? [],
        },
        keywords: {
          extracted: responsePayload.analysis.keywords?.extracted ?? [],
          missing: responsePayload.analysis.keywords?.missing ?? [],
        },
        usedFallback: responsePayload.analysis.usedFallback ?? false,
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
      return true;
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
