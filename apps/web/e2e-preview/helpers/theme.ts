import { expect, type Page } from "@playwright/test";

/**
 * Sets the persisted theme (same mechanism as `apps/web/e2e/*.screenshot.spec.ts`)
 * and reloads so `resolve-theme`'s inline script re-applies it.
 *
 * #128: `page.reload()` resolves once navigation is committed, not once the
 * document is actually settled — a caller that runs `axe.analyze()` (or
 * anything else DOM-dependent) immediately after `await setTheme(...)` can
 * race the reload and scan a still-loading document, which is exactly the
 * flaky `doc-has-title` axe failure the issue describes (SSR HTML always has
 * a `<title>`, so a title-less scan means the scan ran too early). The fix
 * lives here, in the shared helper, rather than in each call site, so every
 * spec that reloads via `setTheme` gets the same readiness gate for free:
 * wait for the title to be non-empty as a cheap, reliable proxy for "the
 * reloaded document has settled" before returning control to the caller.
 */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.reload();
  await expect(page).toHaveTitle(/.+/);
}
