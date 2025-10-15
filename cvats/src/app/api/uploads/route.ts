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

export async function GET() {
  const cvs = await cvRepository.listForUser(STUB_USER_ID);
  return NextResponse.json({ cvs }, { status: 200 });
}
