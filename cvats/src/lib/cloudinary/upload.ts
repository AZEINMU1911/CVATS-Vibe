export interface CloudinaryUploadResult {
  secureUrl: string;
  bytes: number;
  publicId: string;
  format?: string;
  resourceType: string;
  accessMode: string;
  type: string;
  originalFilename?: string;
  createdAt?: string;
}

const CLOUDINARY_PRESET_ERROR = "Upload preset misconfigured (must be Public/Raw).";

interface UploadOptions {
  file: File;
  cloudName: string;
  uploadPreset: string;
  fetchFn?: typeof fetch;
}

export const uploadResumeToCloudinary = async ({
  file,
  cloudName,
  uploadPreset,
  fetchFn = fetch,
}: UploadOptions): Promise<CloudinaryUploadResult> => {
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetchFn(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed with status ${response.status}`);
  }

  const payload: Record<string, unknown> = await response.json();
  const secureUrl = typeof payload.secure_url === "string" ? payload.secure_url : "";
  const publicId = typeof payload.public_id === "string" ? payload.public_id : "";
  const resourceType =
    typeof payload.resource_type === "string" ? payload.resource_type.toLowerCase() : "";
  const accessMode =
    typeof payload.access_mode === "string" ? payload.access_mode.toLowerCase() : "";
  const deliveryType = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
  const bytes = typeof payload.bytes === "number" ? payload.bytes : file.size;
  const format = typeof payload.format === "string" ? payload.format : undefined;
  const originalFilename =
    typeof payload.original_filename === "string" ? payload.original_filename : undefined;
  const createdAt =
    typeof payload.created_at === "string" || payload.created_at instanceof Date
      ? String(payload.created_at)
      : undefined;

  const missingCore = !secureUrl || !publicId;
  const presetMisconfigured =
    resourceType !== "raw" || accessMode !== "public" || deliveryType !== "upload";

  if (missingCore || presetMisconfigured) {
    console.error("cloudinary_upload_misconfigured", {
      resourceType,
      accessMode,
      deliveryType,
      secureUrl,
      publicId,
    });
    throw new Error(CLOUDINARY_PRESET_ERROR);
  }

  const result: CloudinaryUploadResult = {
    secureUrl,
    bytes,
    publicId,
    resourceType,
    accessMode,
    type: deliveryType,
  };

  if (typeof format === "string" && format.length > 0) {
    result.format = format;
  }
  if (originalFilename) {
    result.originalFilename = originalFilename;
  }
  if (createdAt) {
    result.createdAt = createdAt;
  }

  return result;
};

export const uploadPresetErrorMessage = CLOUDINARY_PRESET_ERROR;
