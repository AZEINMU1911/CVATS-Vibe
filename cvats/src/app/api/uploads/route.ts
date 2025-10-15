import { NextResponse } from "next/server";

const ERROR_MESSAGES = {
  missing: "File payload is required.",
  notMultipart: "Expected multipart form data.",
} as const;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: ERROR_MESSAGES.notMultipart }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: ERROR_MESSAGES.missing }, { status: 400 });
  }

  return NextResponse.json(
    {
      message: "Upload handling is not yet implemented. Files should be sent directly to Cloudinary.",
    },
    { status: 501 },
  );
}

export async function GET() {
  return NextResponse.json({
    message: "Uploads listing is not yet implemented.",
  });
}
