import { useCallback, useState } from "react";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface CloudinaryUploadResult {
  fileUrl: string;
  bytes: number;
  publicId?: string;
  format?: string;
}

const FALLBACK_ENV: Record<string, string> = {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo",
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: "unsigned",
};

const getEnvOrThrow = (name: string, value: string | undefined): string => {
  if (value && value.length > 0) {
    return value;
  }

  const fallback = FALLBACK_ENV[name];
  if (fallback) {
    return fallback;
  }

  throw new Error(`${name} is not defined. Configure it in your environment.`);
};

export const useUploadToCloudinary = () => {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const cloudName = getEnvOrThrow(
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  );
  const uploadPreset = getEnvOrThrow(
    "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  );

  const upload = useCallback(
    async (file: File): Promise<CloudinaryUploadResult> => {
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
    [cloudName, uploadPreset],
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
