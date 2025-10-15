import { NextResponse } from "next/server";
import { z } from "zod";
import { cvRepository, STUB_USER_ID } from "@/server/cv-repository";
import { validateFile } from "@/lib/validate-file";

const payloadSchema = z.object({
  fileUrl: z.string().url(),
  originalName: z.string().min(1).max(512),
  mime: z.string().min(1).max(256),
  size: z.number().int().positive(),
  publicId: z.string().min(1).max(256).optional(),
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
  const raw = await readJson(request);
  const parseResult = payloadSchema.safeParse(raw);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload", details: parseResult.error.format() }, { status: 400 });
  }

  const { originalName, mime, size, fileUrl, publicId } = parseResult.data;
  const validation = validateFile({ size, type: mime, name: originalName });

  if (!validation.ok) {
    const message = validationMessages[validation.error];
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const created = await cvRepository.createForUser(STUB_USER_ID, {
    fileName: originalName,
    fileUrl,
    fileSize: size,
    mimeType: mime,
    publicId: publicId ?? null,
  });

  return NextResponse.json({ cv: created }, { status: 201 });
}

const getPaginationParams = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "10", 10);
  const cursor = searchParams.get("cursor") ?? undefined;
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 10;
  return { limit: safeLimit, cursor };
};

export async function GET(request: Request) {
  const { limit, cursor } = getPaginationParams(request);
  const { items, nextCursor } = await cvRepository.listPage(STUB_USER_ID, limit, cursor);
  return NextResponse.json({ cvs: items, nextCursor }, { status: 200 });
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  const parsed = deleteSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const deleted = await cvRepository.deleteById(parsed.data.id, STUB_USER_ID);
  if (!deleted) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
