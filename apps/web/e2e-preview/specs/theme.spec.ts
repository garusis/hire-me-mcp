import { expect, test } from "../helpers/fixtures";

/** Theme toggle persistence (#58): the toggle flips `data-theme` and survives a reload. */
test("theme toggle persists across a reload", async ({ gotoRoute, page }) => {
  await gotoRoute("/");

  const toggle = page.getByRole("button", { name: /theme/i });
  const initialPressed = await toggle.getAttribute("aria-pressed");
  const initialTheme = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );

  await toggle.click();

  const toggledPressed = await toggle.getAttribute("aria-pressed");
  expect(toggledPressed).not.toBe(initialPressed);
  const toggledTheme = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  expect(toggledTheme).not.toBe(initialTheme);

  await page.reload();

  const persistedTheme = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  expect(persistedTheme).toBe(toggledTheme);
  await expect(toggle).toHaveAttribute("aria-pressed", toggledPressed ?? "");
});
