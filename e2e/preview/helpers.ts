import type { Page } from "@playwright/test";

/**
 * Every route the preview gates (#58) must cover, per the issue's Context
 * list: home, the four content routes, one project detail page (used as
 * the representative dynamic route for a11y/responsive/Lighthouse checks),
 * and the MCP section (#43).
 */
export const ROUTES = [
  "/",
  "/experience",
  "/projects",
  "/projects/cowork",
  "/skills",
  "/writing",
  "/mcp",
] as const;

export const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Sets the site's theme the same way `ThemeToggle` does (localStorage +
 * `data-theme` on `<html>`) — matches the pattern already duplicated across
 * `apps/web/e2e/*.screenshot.spec.ts`, lifted here so the preview suite has
 * one shared implementation instead of a fourth copy.
 */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
}

/**
 * Starts collecting console errors and uncaught page errors for `page`.
 * Call before navigating; read the returned array after the assertions
 * under test have had a chance to run.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}
