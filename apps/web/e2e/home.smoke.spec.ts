import { expect, test } from "@playwright/test";

/**
 * Smoke test only — asserts the scaffolded home page responds and renders a
 * real, stable element. Rich product e2e coverage of the portfolio UI
 * belongs to Epic #4; this suite exists to prove the production build boots
 * and CI catches a broken page, nothing more.
 */
test("home page responds and renders the heading", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Hire-me MCP" })).toBeVisible();
});
