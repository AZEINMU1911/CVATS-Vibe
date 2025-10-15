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

  await page.route("**/api/uploads", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/analyses", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis: {
            id: "test-analysis",
            cvId: route.request().postDataJSON()?.cvId ?? "cv",
            score: 100,
            keywordsMatched: ["javascript", "react", "node", "typescript", "nextjs"],
            message: null,
            createdAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/dashboard");
  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  await page.getByRole("button", { name: "Save to CVs" }).click();

  await expect(page.getByRole("link", { name: "sample.pdf" }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Cloudinary ID: cvats/sample").first()).toBeVisible();
  const newestCard = page.locator("li").first();
  await newestCard.getByRole("button", { name: "Analyze" }).click();
  await expect(newestCard.getByText(/Score:/i)).toBeVisible({ timeout: 12000 });
  await expect(newestCard.getByText("javascript", { exact: false })).toBeVisible();

  const items = page.locator("li");
  const countBeforeDelete = await items.count();
  await page.once("dialog", (dialog) => dialog.accept());
  await newestCard.getByRole("button", { name: "Delete" }).click();
  await expect(items).toHaveCount(countBeforeDelete - 1);
});
