import type { Page } from "@playwright/test";

/** Sets the persisted theme (same mechanism as `apps/web/e2e/*.screenshot.spec.ts`) and reloads so `resolve-theme`'s inline script re-applies it. */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.reload();
}
