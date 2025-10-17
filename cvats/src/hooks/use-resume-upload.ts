import { useCallback, useState } from "react";
import type { CvListItem } from "@/hooks/use-cv-list";
import type { InlineAnalysisPayload } from "@/types/analysis";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadSuccess {
  cv: CvListItem;
  inline: InlineAnalysisPayload;
}

type UploadErrorPayload = {
  error?: string;
  detail?: string;
};

const errorTranslations: Record<string, string> = {
  CLOUDINARY_UPLOAD_INVALID_RESPONSE: "Upload response missing required Cloudinary metadata.",
  CLOUDINARY_UPLOAD_INVALID_TYPE: "Cloudinary upload must use the raw resource type.",
  CLOUDINARY_UPLOAD_INVALID_DELIVERY: "Cloudinary upload must use the default delivery type.",
  INVALID_INLINE_BYTES: "Provided inline file bytes are invalid.",
  CLOUDINARY_UPLOAD_EMPTY_BUFFER: "Uploaded file was empty.",
  "File appears to be empty.": "Uploaded file was empty.",
};

const parseErrorPayload = async (response: Response): Promise<UploadErrorPayload> => {
  try {
    return (await response.json()) as UploadErrorPayload;
  } catch {
    return {};
  }
};

const translateError = (value?: string): string | null => {
  if (!value) {
    return null;
  }
  if (errorTranslations[value]) {
    return errorTranslations[value];
  }
  return value;
};

export const useResumeUpload = () => {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadSuccess> => {
      setStatus("uploading");
      setError(null);

      const form = new FormData();
      form.set("file", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
        credentials: "include",
      }).catch(() => null);

      if (!response) {
        const message = "Upload failed. Please check your connection.";
        setStatus("error");
        setError(message);
        throw new Error(message);
      }

      if (!response.ok) {
        const payload = await parseErrorPayload(response);
        const message =
          translateError(payload.error) ??
          translateError(payload.detail) ??
          `Upload failed with status ${response.status}.`;
        setStatus("error");
        setError(message);
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        cv?: CvListItem;
        transient?: { __bytes?: string; mimeType?: string };
      };
      const cv = payload.cv;
      const inlineBytes = payload.transient?.__bytes;
      const inlineMime = payload.transient?.mimeType;

      if (!cv || typeof inlineBytes !== "string" || inlineBytes.length === 0) {
        const message = "Upload response missing expected data.";
        setStatus("error");
        setError(message);
        throw new Error(message);
      }

      setStatus("success");
      return {
        cv,
        inline: {
          bytes: inlineBytes,
          mimeType: typeof inlineMime === "string" && inlineMime.length > 0 ? inlineMime : cv.mimeType,
        },
      };
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    upload,
    reset,
  };
};
