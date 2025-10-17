import type { UploadApiResponse } from "cloudinary";
import { initCloudinary } from "@/server/cloudinary-auth";

export interface RawUploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  resource_type: string;
  access_mode: string;
  type: string;
  format?: string | null;
  original_filename?: string | null;
  created_at?: string | null;
  version?: number | string | null;
}

type StubResultFactory = (input: { buffer: Buffer }) => RawUploadResult;

type UploadStub =
  | { mode: "success"; result: RawUploadResult | StubResultFactory }
  | { mode: "error"; error: Error | (() => Error) };

let uploadStub: UploadStub | null = null;

const toRawUploadResult = (payload: UploadApiResponse): RawUploadResult => ({
  secure_url: payload.secure_url,
  public_id: payload.public_id,
  bytes: typeof payload.bytes === "number" && Number.isFinite(payload.bytes) ? payload.bytes : 0,
  resource_type: payload.resource_type,
  access_mode: payload.access_mode,
  type: payload.type,
  format: payload.format ?? null,
  original_filename: payload.original_filename ?? null,
  created_at: typeof payload.created_at === "string" ? payload.created_at : null,
  version: payload.version ?? null,
});

export const uploadRawBuffer = async (buffer: Buffer): Promise<RawUploadResult> => {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("CLOUDINARY_UPLOAD_EMPTY_BUFFER");
  }

  const stub = uploadStub;
  if (stub) {
    if (stub.mode === "error") {
      const error = typeof stub.error === "function" ? stub.error() : stub.error;
      throw error;
    }
    const result = typeof stub.result === "function" ? stub.result({ buffer }) : stub.result;
    return {
      ...result,
      bytes: result.bytes ?? buffer.byteLength,
      resource_type: result.resource_type ?? "raw",
      access_mode: result.access_mode ?? "authenticated",
      type: result.type ?? "upload",
      format: result.format ?? null,
      original_filename: result.original_filename ?? null,
      created_at: result.created_at ?? new Date().toISOString(),
      version: result.version ?? null,
    };
  }

  const cloudinary = initCloudinary();

  return await new Promise<RawUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "cvs",
        type: "upload",
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          const message = error?.message ?? "Cloudinary upload failed";
          reject(new Error(message));
          return;
        }
        resolve(toRawUploadResult(result));
      },
    );

    stream.on("error", (error) => {
      reject(error instanceof Error ? error : new Error("Cloudinary upload stream failed"));
    });

    stream.end(buffer);
  });
};

export const setCloudinaryUploadStub = (stub: UploadStub | null): void => {
  uploadStub = stub;
};

export const resetCloudinaryUploadStub = (): void => {
  uploadStub = null;
};
