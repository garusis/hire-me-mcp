import { expect, test } from "@playwright/test";

/**
 * Not a correctness check — a screenshot harness, originally for the
 * design-system PR (#15) and extended in #28 to cover the real, data-driven
 * home page (hero, bio, highlights, MCP teaser). Captures the home page at
 * mobile (360px) and desktop (1440px) widths, in both light and dark theme,
 * so PR descriptions can attach visual evidence without a manual browser
 * session. Screenshots land in apps/web/e2e/screenshots/ (git-ignored).
 */
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const THEMES = ["light", "dark"] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`home page — ${viewport.name} — ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Marcos Javier Alvarez" }),
      ).toBeVisible();
      // Each section of the home page is wrapped in its own RevealOnScroll —
      // scroll to the bottom first so every wrapper's IntersectionObserver
      // fires (below-the-fold sections never reveal otherwise), then wait
      // for all of them to flip to the revealed state before capturing,
      // otherwise the full-page screenshot catches mid-fade content.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator('[data-reveal="pending"]')).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      // Let the reveal's opacity/transform transition (--motion-duration-slow) finish.
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `apps/web/e2e/screenshots/home-${viewport.name}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
