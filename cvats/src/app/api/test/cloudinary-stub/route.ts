import { NextResponse } from "next/server";
import {
  resetCloudinaryUploadStub,
  setCloudinaryUploadStub,
  type RawUploadResult,
} from "@/server/cloudinary-upload";

const isProduction = process.env.NODE_ENV === "production";

interface StubPayload {
  mode?: "success" | "error" | "reset";
  result?: Partial<RawUploadResult>;
  errorMessage?: string;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultResult = (): RawUploadResult => ({
  secure_url: "http://127.0.0.1:3000/fixtures/sample.pdf",
  public_id: "cvs/stubbed-upload",
  bytes: 8192,
  resource_type: "raw",
  access_mode: "authenticated",
  type: "upload",
  format: "pdf",
  original_filename: "sample.pdf",
  created_at: new Date().toISOString(),
  version: 1,
});

export async function POST(request: Request) {
  if (isProduction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: StubPayload | null = null;
  try {
    payload = (await request.json()) as StubPayload;
  } catch {
    payload = null;
  }

  if (!payload || payload.mode === "reset") {
    resetCloudinaryUploadStub();
    return NextResponse.json({ ok: true });
  }

  if (payload.mode === "error") {
    const message = payload.errorMessage ?? "CLOUDINARY_UPLOAD_STUB_ERROR";
    setCloudinaryUploadStub({
      mode: "error",
      error: () => new Error(message),
    });
    return NextResponse.json({ ok: true });
  }

  const base = defaultResult();
  const overrides = payload.result ?? {};
  const merged: RawUploadResult = {
    secure_url: overrides.secure_url ?? base.secure_url,
    public_id: overrides.public_id ?? base.public_id,
    bytes: overrides.bytes ?? base.bytes,
    resource_type: overrides.resource_type ?? base.resource_type,
    access_mode: overrides.access_mode ?? base.access_mode,
    type: overrides.type ?? base.type,
    format:
      overrides.format !== undefined
        ? overrides.format
        : base.format !== undefined
          ? base.format
          : null,
    original_filename:
      overrides.original_filename !== undefined
        ? overrides.original_filename
        : base.original_filename !== undefined
          ? base.original_filename
          : null,
    created_at:
      overrides.created_at !== undefined
        ? overrides.created_at
        : base.created_at !== undefined
          ? base.created_at
          : null,
    version:
      overrides.version !== undefined
        ? overrides.version
        : base.version !== undefined
          ? base.version
          : null,
  };

  setCloudinaryUploadStub({
    mode: "success",
    result: merged,
  });

  return NextResponse.json({ ok: true, result: merged });
}
