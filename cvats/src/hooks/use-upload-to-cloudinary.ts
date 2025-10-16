import { useCallback, useState } from "react";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface CloudinaryUploadResult {
  fileUrl: string;
  bytes: number;
  publicId?: string;
  format?: string;
}

export const useUploadToCloudinary = () => {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() ?? "";
  const isConfigured = cloudName.length > 0 && uploadPreset.length > 0;
  const configurationError = isConfigured
    ? null
    : "Cloudinary uploads are disabled. Configure CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.";

  const [status, setStatus] = useState<UploadStatus>(isConfigured ? "idle" : "error");
  const [error, setError] = useState<string | null>(configurationError);

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
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        setStatus("error");
        const message = `Cloudinary upload failed with status ${response.status}`;
        setError(message);
        throw new Error(message);
      }

      const payload: Record<string, unknown> = await response.json();
      const secureUrl = typeof payload.secure_url === "string" ? payload.secure_url : null;
      const publicId = typeof payload.public_id === "string" ? payload.public_id : undefined;
      const bytes = typeof payload.bytes === "number" ? payload.bytes : file.size;

      if (!secureUrl) {
        setStatus("error");
        const message = "Cloudinary response did not include a secure_url.";
        setError(message);
        throw new Error(message);
      }

      setStatus("success");
      const result: CloudinaryUploadResult = {
        fileUrl: secureUrl,
        bytes,
      };

      if (publicId) {
        result.publicId = publicId;
      }
      if (typeof payload.format === "string") {
        result.format = payload.format;
      }

      return result;
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
