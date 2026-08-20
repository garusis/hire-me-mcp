import { defineConfig, devices } from "@playwright/test";
import { resolveBaseUrl } from "./apps/web/e2e-preview/helpers/base-url";
import { bypassHeaders } from "./apps/web/e2e-preview/helpers/bypass";

/**
 * Playwright configuration for the preview gate suite (#58) — navigation,
 * project filters, dark/light theme persistence, content-correctness spot
 * checks against `packages/career-data`/`packages/core`, axe accessibility
 * scans, responsive/no-horizontal-overflow checks, and SEO artifact checks.
 *
 * Deliberately separate from the root `playwright.config.ts` (the #36
 * smoke suite): that config always boots its own local production server
 * (`webServer`) and only ever targets `localhost`. This config has **no**
 * `webServer` at all — it always targets an already-running deployment via
 * `BASE_URL` (a Vercel preview in CI, or any arbitrary URL locally,
 * including a `pnpm test:e2e`-started local production server). See
 * `apps/web/README.md#preview-gates` for the documented local commands.
 *
 * The Vercel Deployment Protection bypass (owner-approved decision on
 * issue #58 — Standard Protection stays ON for previews) is applied here
 * for every request-context call (`page.request`, `request` fixture) via
 * `extraHTTPHeaders`; real browser navigation additionally needs the
 * query-param + cookie mode, applied per-navigation by the `gotoRoute`
 * fixture (`apps/web/e2e-preview/helpers/fixtures.ts`) since a header alone
 * doesn't reliably survive Vercel's own redirects — see
 * `apps/web/e2e-preview/helpers/bypass.ts`.
 */
const baseURL = resolveBaseUrl();

export default defineConfig({
  testDir: "./apps/web/e2e-preview/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 60_000,
  reporter: process.env.CI
    ? [
        ["html", { open: "never", outputFolder: "playwright-preview-report" }],
        ["json", { outputFile: "playwright-preview-report/results.json" }],
        ["github"],
      ]
    : [["html", { open: "never", outputFolder: "playwright-preview-report" }]],
  outputDir: "test-results-preview",
  use: {
    baseURL,
    extraHTTPHeaders: bypassHeaders(),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
