import { expect, test } from "@playwright/test";

/**
 * Screenshot harness for the #43 PR description — captures `/mcp` at
 * mobile (360px) and desktop (1440px) widths, in both themes, against the
 * production build (same approach as `skills-writing.screenshot.spec.ts`
 * from #30). No `RevealOnScroll` is used on this page, so unlike
 * `design-system.screenshot.spec.ts` there's no scroll-and-wait dance
 * needed before capturing. Screenshots land in apps/web/e2e/screenshots/
 * (git-ignored).
 */
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

const THEMES = ["light", "dark"] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`mcp page — ${viewport.name} — ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/mcp");
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Add me to your AI" }),
      ).toBeVisible();
      await page.screenshot({
        path: `apps/web/e2e/screenshots/mcp-${viewport.name}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
