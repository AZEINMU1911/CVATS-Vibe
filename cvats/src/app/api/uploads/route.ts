import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import { validateFile } from "@/lib/validate-file";
import { getAuthSession } from "@/lib/auth/session";

const payloadSchema = z.object({
  secure_url: z.string().url(),
  public_id: z.string().min(1).max(512),
  resource_type: z.string().min(1),
  access_mode: z.string().min(1),
  type: z.string().min(1),
  bytes: z.number().int().positive().optional(),
  format: z.string().min(1).max(64).optional().nullable(),
  original_filename: z.string().min(1).max(512).optional().nullable(),
  created_at: z.string().min(1).max(128).optional().nullable(),
  mimeType: z.string().min(1).max(256),
});

const validationMessages: Record<"invalid-type" | "file-too-large", string> = {
  "invalid-type": "File type is not allowed.",
  "file-too-large": "File exceeds the maximum allowed size.",
};

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await readJson(request);
  const parseResult = payloadSchema.safeParse(raw);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload", details: parseResult.error.format() }, { status: 400 });
  }

  const {
    secure_url,
    public_id,
    resource_type,
    access_mode,
    type,
    bytes,
    format,
    original_filename,
    created_at,
    mimeType,
  } = parseResult.data;

  const normalizedResource = resource_type.toLowerCase();
  const normalizedAccess = access_mode.toLowerCase();
  const normalizedType = type.toLowerCase();

  if (normalizedResource !== "raw" || normalizedAccess !== "public" || normalizedType !== "upload") {
    console.error("UPLOAD_INVALID_RESOURCE", {
      resourceType: normalizedResource,
      accessMode: normalizedAccess,
      deliveryType: normalizedType,
      secureUrl: secure_url,
    });
    return NextResponse.json(
      { error: "CLOUDINARY_PRESET_NOT_PUBLIC_RAW" },
      { status: 422 },
    );
  }

  const fileSize = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : undefined;
  const derivedNameBase =
    typeof original_filename === "string" && original_filename.trim().length > 0
      ? original_filename.trim()
      : public_id.split("/").pop() ?? "document";
  const derivedExtension =
    typeof format === "string" && format.trim().length > 0 ? `.${format.trim()}` : "";
  const resolvedFileName = `${derivedNameBase}${derivedExtension}`;
  const sizeForValidation = fileSize && fileSize > 0 ? fileSize : 1;

  const validation = validateFile({
    size: sizeForValidation,
    type: mimeType,
    name: resolvedFileName,
  });

  if (!validation.ok) {
    const message = validationMessages[validation.error];
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const created = await cvRepository.createForUser(session.user.id, {
      fileName: resolvedFileName,
      secureUrl: secure_url,
      publicId: public_id,
      resourceType: normalizedResource,
      accessMode: normalizedAccess,
      type: normalizedType,
      fileSize: fileSize ?? sizeForValidation ?? 0,
      mimeType,
      bytes: fileSize ?? null,
      format: format ?? null,
      originalFilename: derivedNameBase,
      createdAtRaw: created_at ?? null,
    });

    return NextResponse.json({ cv: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create CV";
    console.error("UPLOAD_ERROR", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const getPaginationParams = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "10", 10);
  const cursor = searchParams.get("cursor") ?? undefined;
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 10;
  return { limit: safeLimit, cursor };
};

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { limit, cursor } = getPaginationParams(request);
  const { items, nextCursor } = await cvRepository.listPage(session.user.id, limit, cursor);
  return NextResponse.json({ cvs: items, nextCursor }, { status: 200 });
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  const parsed = deleteSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const deleted = await cvRepository.deleteById(parsed.data.id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
