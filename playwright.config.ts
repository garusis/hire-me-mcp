import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the smoke e2e suite.
 *
 * Scope: a single smoke spec against apps/web's home page, run against a
 * production build (`next build` + `next start`), never the dev server.
 * Vitest (vitest.config.base.ts) owns unit/integration tests and never boots
 * a browser; this config and everything under apps/web/e2e is intentionally
 * kept out of Vitest's include globs, and this file is excluded from
 * Vitest's test discovery in turn. Chromium only — this is a smoke check,
 * not a cross-browser matrix (that belongs to product e2e coverage later).
 */
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm turbo run build --filter=@hire-me-mcp/web && pnpm --filter @hire-me-mcp/web start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
