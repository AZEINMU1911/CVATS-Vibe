import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/uploads/route";
import { resetCvRepository } from "@/server/cv-repository";

const getAuthSessionMock = vi.fn();
const uploadRawBufferMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: () => getAuthSessionMock(),
}));

vi.mock("@/server/cloudinary-upload", () => ({
  uploadRawBuffer: (...args: unknown[]) => uploadRawBufferMock(...args),
}));

const USER_ID = "user-test-id";

const createPdfFile = (size = 4): File => {
  const bytes = new Uint8Array(size).fill(0x25);
  return new File([bytes], "resume.pdf", { type: "application/pdf" });
};

const formRequest = (file: File): Request => {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost/api/uploads", {
    method: "POST",
    body: form,
  });
};

describe("api/uploads route", () => {
  beforeEach(() => {
    resetCvRepository();
    getAuthSessionMock.mockReset();
    uploadRawBufferMock.mockReset();
    delete process.env.NEXT_PUBLIC_MAX_FILE_MB;
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    const file = createPdfFile();
    const response = await POST(formRequest(file));
    expect(response.status).toBe(401);
    expect(uploadRawBufferMock).not.toHaveBeenCalled();
  });

  it("streams resume to Cloudinary and persists metadata", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const file = createPdfFile(6);
    uploadRawBufferMock.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/raw/upload/v1/sample.pdf",
      public_id: "cvs/sample-id",
      bytes: file.size,
      resource_type: "raw",
      access_mode: "authenticated",
      type: "upload",
      format: "pdf",
      original_filename: "resume",
      created_at: "2024-01-01T00:00:00Z",
      version: 42,
    });

    const response = await POST(formRequest(file));
    expect(response.status).toBe(201);
    expect(uploadRawBufferMock).toHaveBeenCalledTimes(1);
    const [bufferArg] = uploadRawBufferMock.mock.calls[0]!;
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect((bufferArg as Buffer).byteLength).toBe(file.size);

    const payload = (await response.json()) as {
      cv?: Record<string, unknown>;
      transient?: { __bytes?: string; mimeType?: string };
      cvId?: string;
    };
    expect(payload.cv).toBeDefined();
    expect(payload.transient?.__bytes).toBeDefined();
    expect(payload.transient?.__bytes?.length).toBeGreaterThan(0);
    expect(payload.transient?.mimeType).toBe("application/pdf");
    expect(payload.cvId).toBeTypeOf("string");
    expect(payload.cvId).toBe(payload.cv?.id);

    expect(payload.cv).toMatchObject({
      fileName: "resume.pdf",
      fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/sample.pdf",
      publicId: "cvs/sample-id",
      resourceType: "raw",
      accessMode: "authenticated",
      type: "upload",
    });
  });

  it("rejects files that exceed the configured max size", async () => {
    process.env.NEXT_PUBLIC_MAX_FILE_MB = "0.0001";
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const file = createPdfFile(1024);

    const response = await POST(formRequest(file));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("File exceeds the maximum allowed size.");
    expect(uploadRawBufferMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported mime types", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const file = new File([new Uint8Array([1, 2, 3])], "note.txt", { type: "text/plain" });

    const response = await POST(formRequest(file));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("File type is not allowed.");
    expect(uploadRawBufferMock).not.toHaveBeenCalled();
  });

  it("returns 502 when Cloudinary responds without required fields", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const file = createPdfFile();
    uploadRawBufferMock.mockResolvedValue({
      secure_url: "",
      public_id: "",
      bytes: file.size,
      resource_type: "raw",
      access_mode: "authenticated",
      type: "upload",
    });

    const response = await POST(formRequest(file));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("CLOUDINARY_UPLOAD_INVALID_RESPONSE");
  });

  it("returns 404 when deleting unknown CV", async () => {
    getAuthSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    const request = new Request("http://localhost/api/uploads?id=missing", {
      method: "DELETE",
    });

    const response = await DELETE(request);
    expect(response.status).toBe(404);
  });
});
