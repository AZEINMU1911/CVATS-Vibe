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
