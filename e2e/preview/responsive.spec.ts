import { expect, test } from "@playwright/test";
import { ROUTES, VIEWPORTS } from "./helpers";

/**
 * No horizontal overflow at mobile (360px), tablet (768px) and desktop
 * (1440px) — #58's Scope bullet, checked on every route the suite covers.
 */
for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route} has no horizontal overflow @ ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `${route} at ${viewport.width}px: scrollWidth ${scrollWidth} exceeds clientWidth ${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
}
