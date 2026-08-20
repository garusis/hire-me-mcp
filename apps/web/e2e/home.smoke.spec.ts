import { expect, test } from "@playwright/test";

/**
 * Smoke test only — asserts the home page responds and renders a real,
 * stable element. Rich product e2e coverage of the portfolio UI belongs to
 * Epic #4; this suite exists to prove the production build boots and CI
 * catches a broken page, nothing more.
 *
 * The h1 changed from the placeholder "Hire-me MCP" to the profile's own
 * name (#28 — the home page now composes a real, data-driven hero from the
 * content layer instead of the design-system scaffolding placeholder).
 */
test("home page responds and renders the heading", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", { level: 1, name: "Marcos Javier Alvarez" }),
  ).toBeVisible();
});
