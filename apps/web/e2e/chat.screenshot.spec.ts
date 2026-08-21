import { expect, test } from "@playwright/test";

/**
 * Screenshot harness for the chat surface (#70) — mirrors the pattern in
 * `design-system.screenshot.spec.ts` (#15) and `experience-projects.screenshot.spec.ts`
 * (#29): the closed launcher and the opened panel (with its empty-state
 * starter prompts), at mobile (360px) and desktop (1440px), in both themes,
 * against the production build. Rendering smoke only — the full grounded/
 * gap conversation flows are #73's Playwright task, out of scope here.
 * Screenshots land in apps/web/e2e/screenshots/ (git-ignored).
 */
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const THEMES = ["light", "dark"] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`chat widget — closed — ${viewport.name} — ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await page.reload();

      const launcher = page.getByRole("button", { name: /ask about marcos/i });
      await expect(launcher).toBeVisible();
      await page.screenshot({
        path: `apps/web/e2e/screenshots/chat-closed-${viewport.name}-${theme}.png`,
      });
    });

    test(`chat widget — open, empty state — ${viewport.name} — ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await page.reload();

      await page.getByRole("button", { name: /ask about marcos/i }).click();
      await expect(page.getByRole("log")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /what did marcos build at house numbers/i }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /has he worked with golang/i })).toBeVisible();

      await page.screenshot({
        path: `apps/web/e2e/screenshots/chat-open-${viewport.name}-${theme}.png`,
      });
    });
  }
}
