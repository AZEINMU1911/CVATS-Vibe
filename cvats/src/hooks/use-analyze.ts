import { useCallback, useState } from "react";
import Swal from "sweetalert2";
import { getActiveUserEmail } from "@/lib/auth-client";

export interface AnalysisResult {
  id: string;
  cvId: string;
  score: number | null;
  keywordsMatched: string[];
  message?: string | null;
  createdAt: string;
}

export type AnalysisStatus = "idle" | "running" | "error";

const parseResponse = async (response: Response) => {
  const data = (await response.json().catch(() => ({}))) as {
    analysis?: AnalysisResult;
    error?: string;
  };
  return data;
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
          "x-user-email": getActiveUserEmail(),
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

      const analysis = payload.analysis;
      setAnalyses((current) => [analysis, ...current]);
      setStatus("idle");
      void Swal.fire({
        title: "Analysis complete",
        text: "Analaysis complete",
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
