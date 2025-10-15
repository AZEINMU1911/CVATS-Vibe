import path from "node:path";
import { expect, test } from "@playwright/test";

test("landing page renders marketing content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Understand every resume at a glance." })).toBeVisible();
  await expect(page.getByRole("link", { name: "View dashboard preview" })).toBeVisible();
});

test("dashboard route shows placeholder state", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "My CVs", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Upload a PDF or DOCX resume")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload file" })).toBeVisible();
});

test("dashboard upload persists Cloudinary metadata", async ({ page }) => {
  await page.route("https://api.cloudinary.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secure_url: "https://res.cloudinary.com/demo/sample.pdf",
        public_id: "cvats/sample",
        bytes: 8_192,
      }),
    });
  });

  await page.goto("/dashboard");
  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  await page.getByRole("button", { name: "Upload file" }).click();

  await expect(page.getByRole("link", { name: "sample.pdf" }).first()).toBeVisible();
  await expect(page.getByText("Cloudinary ID: cvats/sample").first()).toBeVisible();
});
