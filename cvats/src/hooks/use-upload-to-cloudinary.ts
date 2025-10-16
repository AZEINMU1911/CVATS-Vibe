import { useCallback, useEffect, useState } from "react";
import {
  uploadPresetErrorMessage,
  uploadResumeToCloudinary,
  type CloudinaryUploadResult,
} from "@/lib/cloudinary/upload";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export const useUploadToCloudinary = () => {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() ?? "";
  const isConfigured = cloudName.length > 0 && uploadPreset.length > 0;
  const configurationError = isConfigured
    ? null
    : "Cloudinary uploads are disabled. Configure CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.";

  const [status, setStatus] = useState<UploadStatus>(isConfigured ? "idle" : "error");
  const [error, setError] = useState<string | null>(configurationError);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("CLD", cloudName, uploadPreset);
    }
  }, [cloudName, uploadPreset]);

  const upload = useCallback(
    async (file: File): Promise<CloudinaryUploadResult> => {
      if (!isConfigured) {
        const message =
          configurationError ??
          "Cloudinary uploads are disabled. Configure CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.";
        setStatus("error");
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setStatus("uploading");
      try {
        const result = await uploadResumeToCloudinary({
          file,
          cloudName,
          uploadPreset,
        });
        setStatus("success");
        return result;
      } catch (err) {
        setStatus("error");
        const message =
          err instanceof Error && err.message === uploadPresetErrorMessage
            ? uploadPresetErrorMessage
            : err instanceof Error
              ? err.message
              : "Cloudinary upload failed.";
        setError(message);
        throw new Error(message);
      }
    },
    [cloudName, uploadPreset, configurationError, isConfigured],
  );

  const reset = useCallback(() => {
    setStatus(isConfigured ? "idle" : "error");
    setError(configurationError);
  }, [configurationError, isConfigured]);

  return {
    status,
    error,
    upload,
    reset,
    isConfigured,
    configError: configurationError,
  };
};
