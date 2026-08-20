import { defineConfig, devices } from "@playwright/test";

/**
 * Preview-targeting Playwright config (#58) — separate from the root
 * `playwright.config.ts`, which always builds and starts a local production
 * server. This config never starts a server: it points at a real deployed
 * URL (a Vercel preview, or any base URL) supplied via `PREVIEW_URL`, so the
 * gates exercise the actual deployed artifact.
 *
 * Run locally:
 *
 *   PREVIEW_URL=https://<preview>.vercel.app \
 *   VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
 *   pnpm test:e2e:preview
 *
 * `VERCEL_AUTOMATION_BYPASS_SECRET` is only required when the target has
 * Vercel Deployment Protection on (every preview does — see README.md
 * "Deployment (Vercel)"); omit it for an unprotected URL (e.g. production).
 */
const PREVIEW_URL = process.env.PREVIEW_URL;
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!PREVIEW_URL) {
  throw new Error(
    "playwright.preview.config.ts requires PREVIEW_URL to be set to the deployment under test, " +
      "e.g. `PREVIEW_URL=https://<preview>.vercel.app pnpm test:e2e:preview`.",
  );
}

export default defineConfig({
  testDir: "./e2e/preview",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Cold starts and real-network flakiness against a live deployment
  // warrant more retries than the local-build suite.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  // Generous timeouts: a preview's serverless functions (including the
  // career-data-backed pages and OG image routes) can cold-start.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results-preview",
  reporter: [["html", { open: "never", outputFolder: "playwright-report-preview" }], ["list"]],
  use: {
    baseURL: PREVIEW_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    // Vercel's Protection Bypass for Automation (owner-approved decision on
    // #58) — sent as a header on every request this context makes,
    // including page navigations and the `request` fixture used by the SEO
    // spec, so no per-test wiring is needed. Deliberately never logged.
    extraHTTPHeaders: BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass": BYPASS_SECRET,
          "x-vercel-set-bypass-cookie": "true",
        }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
