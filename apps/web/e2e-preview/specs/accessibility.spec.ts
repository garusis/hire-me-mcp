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
 *
 * #221 addendum: axe files text whose foreground EQUALS its background — a
 * 1:1 contrast ratio, i.e. invisible text — under `incomplete`, not
 * `violations` ("Element has a 1:1 contrast ratio with the background"; axe
 * can't tell an invisible label from deliberately hidden text). That is how
 * the home page's solid CTAs shipped with unreadable labels while this gate
 * stayed green. The suite now also fails on exactly that incomplete
 * outcome: other `incomplete` reasons (background images, gradients,
 * scrollable overlap) stay out of scope — they are genuinely ambiguous —
 * but identical text/background colors on this site are always a bug.
 */

const ONE_TO_ONE_CONTRAST = /1:1 contrast ratio/;

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

      const invisibleText = results.incomplete
        .filter((check) => check.id === "color-contrast")
        .flatMap((check) =>
          check.nodes.filter((node) =>
            node.any.some((reason) => ONE_TO_ONE_CONTRAST.test(reason.message ?? "")),
          ),
        );

      expect(
        invisibleText,
        invisibleText
          .map((node) => `invisible text (1:1 contrast): ${node.html.slice(0, 160)}`)
          .join("\n"),
      ).toEqual([]);
    });
  }
}
