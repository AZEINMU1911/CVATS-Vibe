import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_MAX_FILE_MB: process.env.NEXT_PUBLIC_MAX_FILE_MB ?? "8",
      NEXT_PUBLIC_ALLOWED_MIME:
        process.env.NEXT_PUBLIC_ALLOWED_MIME ??
        "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://127.0.0.1:3000",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "development-secret",
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "demo",
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "test-key",
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "test-secret",
      CLOUDINARY_SIGNED_URL_BASE:
        process.env.CLOUDINARY_SIGNED_URL_BASE ?? "http://127.0.0.1:3000/api/test/cloudinary-signed",
      CLOUDINARY_SIGNED_FIXTURE_PATH:
        process.env.CLOUDINARY_SIGNED_FIXTURE_PATH ?? path.resolve(__dirname, 'public/fixtures/sample.pdf'),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
