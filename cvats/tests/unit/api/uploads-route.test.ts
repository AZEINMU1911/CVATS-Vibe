import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/uploads/route";
import { resetCvRepository } from "@/server/cv-repository";

describe("POST /api/uploads", () => {
  afterEach(() => {
    resetCvRepository();
  });

  it("returns 400 when required fields are missing", async () => {
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("persist metadata and returns 201 for valid payload", async () => {
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileUrl: "https://example.com/file.pdf",
        originalName: "candidate.pdf",
        mime: "application/pdf",
        size: 512_000,
        publicId: "cvats/test",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { cv: { fileName: string } };
    expect(payload.cv.fileName).toBe("candidate.pdf");
  });
});
