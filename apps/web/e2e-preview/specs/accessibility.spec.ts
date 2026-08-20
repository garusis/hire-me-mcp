import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../helpers/fixtures";
import { ROUTES, THEMES } from "../helpers/routes";
import { setTheme } from "../helpers/theme";

/**
 * Accessibility gate (#58): every route, in both themes, scanned with
 * `@axe-core/playwright`. The bar is zero *serious* or *critical*
 * violations — `minor`/`moderate` findings are out of scope for a hard CI
 * gate and would make this suite flaky against subjective rule
 * interpretations, but a real serious/critical issue fails the PR.
 */

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route.name} — ${theme} theme — no serious/critical axe violations`, async ({
      gotoRoute,
      page,
    }) => {
      await gotoRoute(route.path);
      await setTheme(page, theme);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );

      expect(
        seriousOrCritical,
        seriousOrCritical
          .map(
            (violation) =>
              `${violation.id} (${violation.impact}): ${violation.help} — ${violation.helpUrl}`,
          )
          .join("\n"),
      ).toEqual([]);
    });
  }
}
