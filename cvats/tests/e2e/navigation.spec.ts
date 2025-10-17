import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type ForceAuthWindow = Window & { __forceCloudinaryAuth?: boolean };

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const getCvItems = (page: Page) => page.locator('[data-testid="cv-card"]');

type RouteOptions = {
  cloudinaryOverrides?: Record<string, unknown>;
  stubAnalyses?: boolean;
};

const setupAppRoutes = async (page: Page, options?: RouteOptions) => {
  await page.request.post("/api/test/cloudinary-stub", {
    data: {
      mode: "success",
      result: {
        secure_url: "http://127.0.0.1:3000/api/test/cloudinary-signed?public=1",
        public_id: "cvats/sample",
        bytes: 8_192,
        resource_type: "raw",
        access_mode: "authenticated",
        type: "upload",
        format: "pdf",
        original_filename: "sample",
        created_at: "2024-01-01T00:00:00Z",
        version: 1,
        ...(options?.cloudinaryOverrides ?? {}),
      },
    },
  });

  if (options?.stubAnalyses === false) {
    return;
  }

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

test("blocks uploads when Cloudinary resource type is misconfigured", async ({ page }) => {
  await setupAppRoutes(page, { cloudinaryOverrides: { resource_type: "image" } });

  const timestamp = Date.now();
  const password = "Password123";
  const email = `cloudinary-misconfig-${timestamp}@example.com`;

  await registrationForm(page, email, password);
  await loginForm(page, email, password);

  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  await page.getByRole("button", { name: "Save to CVs" }).click();

  await expect(
    page.getByText("Cloudinary upload must use the raw resource type.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);
});

test("analysis uses signed Cloudinary delivery when public access is blocked", async ({ page }) => {
  try {
    await page.unroute("**/api/analyses");
  } catch {
    // ignore if no existing route
  }
  await setupAppRoutes(page, { stubAnalyses: false });

  await page.addInitScript(() => {
    const globalWindow = window as ForceAuthWindow;
    globalWindow.__forceCloudinaryAuth = false;
    const originalFetch = globalWindow.fetch.bind(globalWindow) as typeof fetch;
    globalWindow.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      let url: string;
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }
       if (url.includes("/api/analyses") && globalWindow.__forceCloudinaryAuth) {
        const headers = new Headers(init.headers ?? {});
        headers.set("x-cloudinary-test", "force-auth");
        init.headers = headers;
      }
      return originalFetch(input, init);
    };
  });

  const timestamp = Date.now();
  const password = "Password123";
  const email = `signed-${timestamp}@example.com`;

  await registrationForm(page, email, password);
  await loginForm(page, email, password);

  const fixturePath = path.resolve(__dirname, "../fixtures/sample.pdf");
  await page.setInputFiles('input[type="file"]', fixturePath);
  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/uploads") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to CVs" }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.status()).toBe(201);

  await expect(page.getByRole("link", { name: "sample.pdf" }).first()).toBeVisible();

  const firstAnalysisResponse = page.waitForResponse((response) =>
    response.url().includes("/api/analyses") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Analyze" }).first().click();
  expect((await firstAnalysisResponse).status()).toBe(201);
  await expect(page.getByText("ATS Score", { exact: false })).toBeVisible({ timeout: 12000 });

  await page.evaluate(() => {
    const globalWindow = window as ForceAuthWindow;
    globalWindow.__forceCloudinaryAuth = true;
  });

  const fallbackAnalysisResponse = page.waitForResponse((response) =>
    response.url().includes("/api/analyses") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Analyze" }).first().click();
  const fallbackResponse = await fallbackAnalysisResponse;
  expect(fallbackResponse.status()).toBe(201);
  await expect(page.getByText("ATS Score", { exact: false })).toBeVisible({ timeout: 12000 });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);
});
