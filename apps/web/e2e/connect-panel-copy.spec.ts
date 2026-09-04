import { expect, test } from "@playwright/test";

/**
 * e2e coverage for #45's copy-payload AC: select each client tab on the
 * home page's Connect panel, click its copy button, and assert the
 * clipboard content equals exactly what's rendered in the snippet — no
 * truncation, no extra whitespace, no drift between what's shown and
 * what's copied. Runs against the production build (root
 * playwright.config.ts), granting clipboard permissions so
 * `navigator.clipboard.readText()` can verify the write actually
 * happened.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("copying each client's snippet on the home Connect panel puts exactly that snippet on the clipboard", async ({
  page,
}) => {
  await page.goto("/");
  const tablist = page.getByRole("tablist");
  await expect(tablist).toBeVisible();

  const tabs = await tablist.getByRole("tab").all();
  expect(tabs.length).toBeGreaterThan(0);

  for (const tab of tabs) {
    const label = await tab.textContent();
    if (label === null) {
      throw new Error("expected every client tab to have a text label");
    }
    await tab.click();

    const panel = page.getByRole("tabpanel");
    const snippetText = await panel.locator("pre code").textContent();
    if (snippetText === null) {
      throw new Error(`expected a snippet for client "${label}"`);
    }

    await panel.getByRole("button", { name: /copy.*snippet/i }).click();
    await expect(panel.getByRole("button", { name: /copied/i })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(snippetText);
  }
});

test("copying the endpoint URL on the home Connect panel puts exactly that URL on the clipboard", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to the Connect section (#mcp): since #308 the hero also renders a
  // mono <code> sample call above it, so the first <code> on the page is no
  // longer the endpoint URL.
  const connectSection = page.locator("#mcp");
  const endpointCode = connectSection.locator("code").first();
  const endpointUrl = await endpointCode.textContent();
  if (endpointUrl === null) {
    throw new Error("expected an endpoint URL to be rendered");
  }

  await connectSection
    .getByRole("button", { name: /copy.*endpoint|copy.*url/i })
    .first()
    .click();
  await expect(connectSection.getByRole("button", { name: /copied/i }).first()).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(endpointUrl);
});
