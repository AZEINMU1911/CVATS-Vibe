import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository } from "@/server/cv-repository";
import { validateFile } from "@/lib/validate-file";
import { getAuthSession } from "@/lib/auth/session";
import { uploadRawBuffer } from "@/server/cloudinary-upload";

const validationMessages: Record<"invalid-type" | "file-too-large", string> = {
  "invalid-type": "File type is not allowed.",
  "file-too-large": "File exceeds the maximum allowed size.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("UPLOAD_FORMDATA_PARSE_FAILED", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Expected file upload." }, { status: 400 });
  }

  const validation = validateFile({
    size: fileEntry.size ?? 0,
    type: fileEntry.type ?? "",
    name: fileEntry.name,
  });

  if (!validation.ok) {
    const message = validationMessages[validation.error];
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await fileEntry.arrayBuffer());
  } catch (error) {
    console.error("UPLOAD_BUFFER_CONVERSION_FAILED", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to read file contents." }, { status: 400 });
  }

  if (!buffer || buffer.byteLength === 0) {
    return NextResponse.json({ error: "File appears to be empty." }, { status: 400 });
  }

  if (buffer.byteLength !== fileEntry.size) {
    console.warn("UPLOAD_SIZE_MISMATCH", {
      reported: fileEntry.size,
      actual: buffer.byteLength,
    });
  }

  try {
    const upload = await uploadRawBuffer(buffer);
    const secureUrl = upload.secure_url?.trim();
    const publicId = upload.public_id?.trim();
    const resourceType = upload.resource_type?.toLowerCase();
    const accessMode = upload.access_mode?.toLowerCase();
    const deliveryType = upload.type?.toLowerCase();

    if (!secureUrl || !publicId) {
      console.error("UPLOAD_CLOUDINARY_MISSING_FIELDS", { secureUrl, publicId });
      return NextResponse.json({ error: "CLOUDINARY_UPLOAD_INVALID_RESPONSE" }, { status: 502 });
    }
    if (resourceType !== "raw") {
      console.error("UPLOAD_CLOUDINARY_INVALID_RESOURCE", { resourceType });
      return NextResponse.json({ error: "CLOUDINARY_UPLOAD_INVALID_TYPE" }, { status: 502 });
    }
    if (deliveryType !== "upload") {
      console.error("UPLOAD_CLOUDINARY_INVALID_DELIVERY", { deliveryType });
      return NextResponse.json({ error: "CLOUDINARY_UPLOAD_INVALID_DELIVERY" }, { status: 502 });
    }

    const created = await cvRepository.createForUser(session.user.id, {
      fileName: fileEntry.name,
      fileUrl: secureUrl,
      secureUrl,
      publicId,
      resourceType,
      accessMode: accessMode ?? "authenticated",
      type: deliveryType,
      fileSize: buffer.byteLength,
      mimeType: fileEntry.type || "application/octet-stream",
      bytes: upload.bytes ?? buffer.byteLength,
      format: upload.format ?? null,
      originalFilename: upload.original_filename ?? fileEntry.name,
      createdAtRaw:
        upload.version !== undefined && upload.version !== null
          ? String(upload.version)
          : upload.created_at ?? null,
    });

    const inlineMimeType = fileEntry.type || "application/octet-stream";
    return NextResponse.json(
      {
        cv: created,
        cvId: created.id,
        transient: {
          __bytes: buffer.toString("base64"),
          mimeType: inlineMimeType,
        },
      },
      { status: 201 },
    );
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
