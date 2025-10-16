import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/uploads/route";
import { resetCvRepository } from "@/server/cv-repository";

const getAuthSessionMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: () => getAuthSessionMock(),
}));

const USER_ID = "user-test-id";

describe("POST /api/uploads", () => {
  afterEach(() => {
    resetCvRepository();
    getAuthSessionMock.mockReset();
  });

  it("returns 400 when required fields are missing", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("persist metadata and returns 201 for valid payload", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secure_url: "https://res.cloudinary.com/demo/raw/upload/v1/candidate.pdf",
        public_id: "cvats/test",
        resource_type: "raw",
        access_mode: "public",
        type: "upload",
        bytes: 512_000,
        format: "pdf",
        original_filename: "candidate",
        created_at: "2024-01-01T00:00:00Z",
        mimeType: "application/pdf",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      cv: { fileName: string; secureUrl: string; resourceType?: string | null; accessMode?: string | null; type?: string | null };
    };
    expect(payload.cv.fileName).toBe("candidate.pdf");
    expect(payload.cv.secureUrl).toBe("https://res.cloudinary.com/demo/raw/upload/v1/candidate.pdf");
    expect(payload.cv.resourceType).toBe("raw");
    expect(payload.cv.accessMode).toBe("public");
    expect(payload.cv.type).toBe("upload");
  });

  it("skips saving when Cloudinary upload is not raw/public", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secure_url: "https://res.cloudinary.com/demo/image/upload/v1/candidate.pdf",
        public_id: "cvats/test",
        resource_type: "image",
        access_mode: "authenticated",
        type: "upload",
        bytes: 512_000,
        format: "pdf",
        original_filename: "candidate",
        created_at: "2024-01-01T00:00:00Z",
        mimeType: "application/pdf",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("CLOUDINARY_PRESET_NOT_PUBLIC_RAW");
  });

  it("returns 404 when deleting unknown CV", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const request = new Request("http://localhost/api/uploads?id=missing", {
      method: "DELETE",
      headers: {},
    });

    const response = await DELETE(request);
    expect(response.status).toBe(404);
  });
});
