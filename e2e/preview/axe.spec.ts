import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES, setTheme, THEMES } from "./helpers";

/**
 * axe scans on every route in both themes (#58's Scope bullet). Zero
 * serious/critical violations is the bar — moderate/minor findings are not
 * asserted here, matching the issue's explicit threshold.
 */
for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`axe: ${route} — ${theme} theme has no serious/critical violations`, async ({ page }) => {
      await page.goto(route);
      await setTheme(page, theme);
      await page.reload();
      await page.waitForLoadState("networkidle");
      // Let the theme's color transition (--motion-duration-base) finish
      // before scanning — otherwise axe can catch a mid-transition color
      // pairing and report a false contrast violation.
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );

      expect(
        seriousOrCritical,
        seriousOrCritical
          .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
          .join("\n"),
      ).toEqual([]);
    });
  }
}
