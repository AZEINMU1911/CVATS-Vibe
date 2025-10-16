import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const getCvItems = (page: Page) => page.locator('[data-testid="cv-card"]');

const setupAppRoutes = async (page: Page) => {
  await page.route("https://api.cloudinary.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secure_url: "http://127.0.0.1:3000/fixtures/sample.pdf",
        public_id: "cvats/sample",
        bytes: 8_192,
        resource_type: "raw",
        access_mode: "public",
      }),
    });
  });

  let analysisCalls = 0;
  const analysisScenarios = [
    {
      atsScore: 91,
      feedback: {
        positive: ["Strong React expertise"],
        improvements: ["Needs more backend exposure"],
      },
      keywords: {
        extracted: ["javascript", "react", "node"],
        missing: ["typescript", "nextjs"],
      },
      usedFallback: false,
      fallbackReason: null,
    },
    {
      atsScore: 62,
      feedback: {
        positive: ["Matched javascript keyword"],
        improvements: ["Highlight leadership achievements"],
      },
      keywords: {
        extracted: ["javascript"],
        missing: ["typescript", "nextjs"],
      },
      usedFallback: true,
      fallbackReason: "EMPTY" as const,
    },
  ];

  await page.route("**/api/analyses", async (route) => {
    if (route.request().method() === "POST") {
      const index = Math.min(analysisCalls, analysisScenarios.length - 1);
      const scenario = analysisScenarios[index];
      if (!scenario) {
        throw new Error("Missing analysis scenario for intercepted request");
      }
      analysisCalls += 1;
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis: {
            id: `test-analysis-${analysisCalls}`,
            cvId: route.request().postDataJSON()?.cvId ?? "cv",
            atsScore: scenario.atsScore,
            feedback: scenario.feedback,
            keywords: scenario.keywords,
            usedFallback: scenario.usedFallback,
            fallbackReason: scenario.fallbackReason,
            createdAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    await route.continue();
  });
};

const registrationForm = async (page: Page, email: string, password: string) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const registerResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/register") && response.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const response = await registerResponse;
  if (response.status() !== 201) {
    throw new Error(`Registration failed with status ${response.status()}`);
  }
  await page.waitForURL(/\/login\?registered=1/, { timeout: 60000 });
};

const loginForm = async (page: Page, email: string, password: string) => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
};

test("landing page renders marketing content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Understand every resume at a glance." })).toBeVisible();
  await expect(page.getByRole("link", { name: "View dashboard preview" })).toBeVisible();
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect(page.url()).toContain("callbackUrl=%2Fdashboard");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("authenticated users are redirected away from auth pages", async ({ page }) => {
  const timestamp = Date.now();
  const password = "Password123";
  const email = `redirect-${timestamp}@example.com`;

  await registrationForm(page, email, password);
  await loginForm(page, email, password);

  await Promise.all([
    page.waitForURL(/\/dashboard/),
    page.goto("/login"),
  ]);
  await expect(page.getByRole("heading", { name: "My CVs" }).first()).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/dashboard/),
    page.goto("/register"),
  ]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);
});

test("register, upload, and isolate CVs per user", async ({ page, browser }) => {
  await setupAppRoutes(page);

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
  await expect(newestCard.getByRole("link", { name: "sample.pdf" })).toBeVisible();
  await newestCard.getByRole("button", { name: "Analyze" }).click();
  await expect(newestCard.getByText("ATS Score", { exact: false })).toBeVisible({ timeout: 12000 });
  await expect(newestCard.getByText("Positive Highlights", { exact: false })).toBeVisible();
  await expect(newestCard.getByText("Strong React expertise", { exact: false })).toBeVisible();
  await expect(newestCard.getByText("Improvements", { exact: false })).toBeVisible();
  await expect(newestCard.getByText("Needs more backend exposure", { exact: false })).toBeVisible();
  await expect(newestCard.locator("text=AI returned an empty result — showing basic analysis.")).toHaveCount(0);

  await newestCard.getByRole("button", { name: "Analyze" }).click();
  const fallbackBanner = newestCard.locator("text=AI returned an empty result — showing basic analysis.");
  await expect(fallbackBanner).toBeVisible({ timeout: 12000 });
  const fallbackCard = fallbackBanner.first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  await expect(fallbackCard.getByText("Positive Highlights", { exact: false })).toBeVisible();
  await expect(fallbackCard.getByText("Matched javascript keyword", { exact: false })).toBeVisible();

  const items = getCvItems(page);
  const countBeforeDelete = await items.count();
  await expect(newestCard.getByRole("button", { name: "Delete" })).toBeVisible();
  await newestCard.getByRole("button", { name: "Delete" }).click();
  await newestCard.getByRole("button", { name: "Confirm delete" }).click();
  await expect(items).toHaveCount(countBeforeDelete - 1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);

  // Register a second user in a fresh context and ensure list is isolated
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await setupAppRoutes(secondPage);

  await registrationForm(secondPage, emailB, password);
  await loginForm(secondPage, emailB, password);
  await expect(secondPage.getByText("No uploads yet", { exact: false })).toBeVisible();

  await secondPage.getByRole("button", { name: "Sign out" }).click();
  await expect(secondPage).toHaveURL(/\/?$/);
  await secondContext.close();
});
