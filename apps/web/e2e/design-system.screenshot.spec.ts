import { expect, test } from "@playwright/test";

/**
 * Not a correctness check — a screenshot harness for the design-system PR
 * (#15). Captures the real home page (the only route that exists in this
 * task's scope) at mobile (360px) and desktop (1440px) widths, in both
 * light and dark theme, so the PR description can attach visual evidence
 * of the token/typography/theme work without a manual browser session.
 * Screenshots land in apps/web/e2e/screenshots/ (git-ignored).
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
      await expect(page.getByRole("heading", { level: 1, name: "Hire-me MCP" })).toBeVisible();
      // The hero is wrapped in RevealOnScroll — wait for its intersection
      // callback to flip the wrapper to the revealed state before
      // capturing, otherwise the screenshot catches mid-fade content.
      await expect(page.locator("[data-reveal]")).toHaveAttribute("data-reveal", "revealed");
      // Let the reveal's opacity/transform transition (--motion-duration-slow) finish.
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `apps/web/e2e/screenshots/home-${viewport.name}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
