import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const getCvItems = (page: Page) => page.locator("main li");

const registrationForm = async (page: Page, email: string, password: string) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/login\?registered=1/);
};

const loginForm = async (page: Page, email: string, password: string) => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
};

test("landing page renders marketing content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Understand every resume at a glance." })).toBeVisible();
  await expect(page.getByRole("link", { name: "View dashboard preview" })).toBeVisible();
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("register, upload, and isolate CVs per user", async ({ page }) => {
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

  const timestamp = Date.now();
  const password = "Password123";
  const emailA = `alice-${timestamp}@example.com`;
  const emailB = `bob-${timestamp}@example.com`;

  // Register and log in as first user
  await registrationForm(page, emailA, password);
  await loginForm(page, emailA, password);

  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/uploads") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to CVs" }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.status()).toBe(201);

  await expect(page.getByRole("link", { name: "sample.pdf" }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Cloudinary ID: cvats/sample").first()).toBeVisible();
  const newestCard = page.locator("main li").first();
  await newestCard.getByRole("button", { name: "Analyze" }).click();
  await expect(newestCard.getByText(/Score:/i)).toBeVisible({ timeout: 12000 });

  const items = getCvItems(page);
  const countBeforeDelete = await items.count();
  await newestCard.getByRole("button", { name: "Delete" }).click();
  await newestCard.getByRole("button", { name: "Confirm delete" }).click();
  await expect(items).toHaveCount(countBeforeDelete - 1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);

  // Register a second user and ensure list is isolated
  await registrationForm(page, emailB, password);
  await loginForm(page, emailB, password);
  await expect(page.getByText("No uploads yet", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);
});
