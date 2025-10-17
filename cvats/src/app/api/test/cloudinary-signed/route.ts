import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

const filePath = join(process.cwd(), "public", "fixtures", "sample.pdf");
const fileStats = () => statSync(filePath);

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>;
  const stats = fileStats();
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(stats.size),
    },
  });
}

export async function HEAD() {
  const stats = fileStats();
  return new NextResponse(null, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(stats.size),
    },
  });
}
