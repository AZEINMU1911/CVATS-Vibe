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
  await expect(page.getByText("Drop your resume here")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to CVs" })).toBeVisible();
});

test("dashboard upload persists Cloudinary metadata", async ({ page }) => {
  await page.route("https://api.cloudinary.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secure_url: "http://127.0.0.1:3000/fixtures/sample.pdf",
        public_id: "cvats/sample",
        bytes: 8_192,
      }),
    });
  });

  await page.goto("/dashboard");
  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  await page.getByRole("button", { name: "Save to CVs" }).click();

  await expect(page.getByRole("link", { name: "sample.pdf" }).first()).toBeVisible();
  await expect(page.getByText("Cloudinary ID: cvats/sample").first()).toBeVisible();
  await page.getByRole("button", { name: "Analyze" }).first().click();
  await expect(page.getByText(/Score:/i)).toBeVisible();
  await expect(page.getByText("javascript", { exact: false })).toBeVisible();
});
