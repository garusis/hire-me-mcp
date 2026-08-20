import { expect, test } from "@playwright/test";

/**
 * Screenshot harness for the #30 PR description — captures `/skills` and
 * `/writing` at mobile (360px) and desktop (1440px) widths, in both themes,
 * against the production build (same approach as
 * `experience-projects.screenshot.spec.ts` from #29). Screenshots land in
 * apps/web/e2e/screenshots/ (git-ignored).
 */
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

const THEMES = ["light", "dark"] as const;

const ROUTES = [
  { path: "/skills", name: "skills", heading: "Skills" },
  { path: "/writing", name: "writing", heading: "Writing" },
] as const;

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${route.name} — ${viewport.name} — ${theme} theme`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route.path);
        await page.evaluate((t) => {
          localStorage.setItem("theme", t);
          document.documentElement.setAttribute("data-theme", t);
        }, theme);
        await page.reload();
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await page.screenshot({
          path: `apps/web/e2e/screenshots/${route.name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      });
    }
  }
}
