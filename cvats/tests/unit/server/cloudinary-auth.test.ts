import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signedRawUrl } from "@/server/cloudinary-auth";

const cloudinaryMocks = vi.hoisted(() => ({
  config: vi.fn(),
  url: vi.fn(),
}));

vi.mock("cloudinary", () => ({
  v2: {
    config: cloudinaryMocks.config,
    url: cloudinaryMocks.url,
  },
}));

const configMock = cloudinaryMocks.config;
const urlMock = cloudinaryMocks.url;

describe("cloudinary auth helpers", () => {
  beforeEach(() => {
    configMock.mockReset();
    urlMock.mockReset();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_SIGNED_URL_BASE;
  });

  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_SIGNED_URL_BASE;
  });

  it("throws when server credentials are missing", () => {
    expect(() => signedRawUrl("cvats/sample")).toThrowError("CLOUDINARY_SERVER_CREDS_MISSING");
  });

  it("generates an authenticated raw URL when credentials are present", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    urlMock.mockReturnValue("https://res.cloudinary.com/demo/raw/authenticated/v1/sample.pdf?s=signature");

    const result = signedRawUrl("cvats/sample", 42);

    expect(configMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith("cvats/sample", {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      secure: true,
      version: 42,
    });
    expect(result).toContain("/raw/authenticated/");
    expect(result).toContain("signature");

    // Subsequent calls reuse the same configuration
    signedRawUrl("cvats/sample");
    expect(configMock).toHaveBeenCalledTimes(1);
  });

  it("respects signed URL override base when provided", () => {
    process.env.CLOUDINARY_SIGNED_URL_BASE = "http://127.0.0.1:3000/fixtures/sample.pdf";
    const result = signedRawUrl("cvats/sample", 5);
    const decoded = decodeURIComponent(result);
    expect(decoded).toContain("fixtures/sample.pdf");
    expect(decoded).toContain("publicId=cvats/sample");
    expect(decoded).toContain("version=5");
    expect(configMock).not.toHaveBeenCalled();
  });
});
