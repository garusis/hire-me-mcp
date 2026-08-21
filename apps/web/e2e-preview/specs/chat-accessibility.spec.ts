import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../helpers/fixtures";
import { THEMES } from "../helpers/routes";
import { setTheme } from "../helpers/theme";

/**
 * Accessibility gate for the chat surface (#70), mirroring
 * `accessibility.spec.ts` (#58): zero serious-or-critical axe violations
 * with the widget's empty-state panel open, in both themes. Separate from
 * that spec (rather than added to its `ROUTES` list) because it needs an
 * extra interaction — opening the launcher — before scanning; every other
 * route there is scanned as-loaded. Rendering/a11y smoke only — the full
 * grounded/gap conversation flows are #73's Playwright task.
 */
for (const theme of THEMES) {
  test(`chat widget open — ${theme} theme — no serious/critical axe violations`, async ({
    gotoRoute,
    page,
  }) => {
    await gotoRoute("/");
    await setTheme(page, theme);

    await page.getByRole("button", { name: /ask about marcos/i }).click();
    await expect(page.getByRole("log")).toBeVisible();

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
