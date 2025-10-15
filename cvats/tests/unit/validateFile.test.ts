import { afterEach, describe, expect, it, vi } from "vitest";
import { validateFile, type FileDescriptor } from "@/lib/validate-file";

const createFile = (overrides: Partial<FileDescriptor> = {}): FileDescriptor => ({
  size: 1_000_000,
  type: "application/pdf",
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateFile", () => {
  it("accepts files that comply with defaults", () => {
    const result = validateFile(createFile());
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts DOCX files when allowed", () => {
    const docxResult = validateFile(
      createFile({
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 2 * 1_048_576,
      }),
    );
    expect(docxResult.ok).toBe(true);
  });

  it("rejects files with disallowed mime types", () => {
    const result = validateFile(createFile({ type: "image/png" }));
    expect(result).toEqual({ ok: false, error: "invalid-type" });
  });

  it("rejects files larger than configured maximum", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_FILE_MB", "2");
    const result = validateFile(createFile({ size: 3 * 1_048_576 }));
    expect(result).toEqual({ ok: false, error: "file-too-large" });
  });

  it("falls back to defaults when env configuration is invalid", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_FILE_MB", "-10");
    vi.stubEnv("NEXT_PUBLIC_ALLOWED_MIME", "  ");
    const result = validateFile(createFile({ size: 8 * 1_048_576 }));
    expect(result.ok).toBe(true);
  });
});
