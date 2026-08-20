import { expect, test } from "../helpers/fixtures";
import { ROUTES, VIEWPORTS } from "../helpers/routes";

/**
 * Responsive checks (#58): every route at mobile (360px), tablet (768px)
 * and desktop (1440px) never scrolls horizontally — `scrollWidth` (the
 * content's actual rendered width) must never exceed `clientWidth` (the
 * viewport's visible width) on either `<html>` or `<body>`.
 */

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route.name} — ${viewport.name} (${viewport.width}px) — no horizontal overflow`, async ({
      gotoRoute,
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoRoute(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        htmlOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      }));

      expect(
        overflow.htmlOverflow,
        `<html> scrollWidth exceeds clientWidth by ${overflow.htmlOverflow}px at ${viewport.width}px on ${route.path}`,
      ).toBeLessThanOrEqual(0);
      expect(
        overflow.bodyOverflow,
        `<body> scrollWidth exceeds clientWidth by ${overflow.bodyOverflow}px at ${viewport.width}px on ${route.path}`,
      ).toBeLessThanOrEqual(0);
    });
  }
}
