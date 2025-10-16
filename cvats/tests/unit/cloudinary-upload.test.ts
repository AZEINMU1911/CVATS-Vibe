import { describe, expect, it, vi, type MockedFunction } from "vitest";
import { uploadPresetErrorMessage, uploadResumeToCloudinary } from "@/lib/cloudinary/upload";

const buildSuccessResponse = (overrides: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    secure_url: "https://res.cloudinary.com/demo/raw/upload/v1/test.pdf",
    public_id: "cvats/test",
    resource_type: "raw",
    access_mode: "public",
    type: "upload",
    bytes: 1024,
    format: "pdf",
    original_filename: "test",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  });

describe("uploadResumeToCloudinary", () => {
  const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });

  it("hits the raw upload endpoint with unsigned preset", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(buildSuccessResponse(), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as MockedFunction<typeof fetch>;

    await uploadResumeToCloudinary({
      file,
      cloudName: "demo",
      uploadPreset: "unsigned",
      fetchFn: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudinary.com/v1_1/demo/raw/upload",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toBeDefined();
    const form = (init!.body as FormData) ?? new FormData();
    expect(form.get("upload_preset")).toBe("unsigned");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("returns Cloudinary metadata when upload succeeds", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(buildSuccessResponse(), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as MockedFunction<typeof fetch>;

    const result = await uploadResumeToCloudinary({
      file,
      cloudName: "demo",
      uploadPreset: "unsigned",
      fetchFn: fetchMock,
    });

    expect(result.secureUrl).toContain("raw/upload");
    expect(result.publicId).toBe("cvats/test");
    expect(result.resourceType).toBe("raw");
    expect(result.accessMode).toBe("public");
    expect(result.type).toBe("upload");
    expect(result.bytes).toBe(1024);
  });

  it("throws when preset is not public/raw", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(
        buildSuccessResponse({ resource_type: "image", access_mode: "authenticated" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as MockedFunction<typeof fetch>;

    await expect(
      uploadResumeToCloudinary({
        file,
        cloudName: "demo",
        uploadPreset: "unsigned",
        fetchFn: fetchMock,
      }),
    ).rejects.toThrow(uploadPresetErrorMessage);
  });
});
