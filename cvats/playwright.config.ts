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
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "demo",
      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET:
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "unsigned",
      NEXT_PUBLIC_MAX_FILE_MB: process.env.NEXT_PUBLIC_MAX_FILE_MB ?? "8",
      NEXT_PUBLIC_ALLOWED_MIME:
        process.env.NEXT_PUBLIC_ALLOWED_MIME ??
        "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://127.0.0.1:3000",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "development-secret",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
