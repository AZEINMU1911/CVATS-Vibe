import { expect, test } from "@playwright/test";

test("landing page renders marketing content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Understand every resume at a glance." })).toBeVisible();
  await expect(page.getByRole("link", { name: "View dashboard preview" })).toBeVisible();
});

test("dashboard route shows placeholder state", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard preview" })).toBeVisible();
  await expect(page.getByText("workspace is under construction").first()).toBeVisible();
});
