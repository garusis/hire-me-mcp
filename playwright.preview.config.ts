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
  // ONE worker in CI, deliberately (#169): the chat specs are multi-step
  // agent conversations, each costing several Gemini calls against the
  // shared gemini-3.5-flash-lite free tier (15 requests/minute). Running
  // them concurrently exceeds that cap — Google stalls the request past
  // Vercel's 60s function limit and the gate 504s. Serial execution keeps
  // the suite deterministic; do not raise this without moving CI to a
  // dedicated Google project or a paid tier (tracked under #52).
  workers: process.env.CI ? 1 : undefined,
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
      // Every spec except latency.spec.ts — see the "chromium-latency"
      // project below for why that one file is split out.
      testIgnore: ["**/latency.spec.ts"],
    },
    {
      name: "chromium-latency",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/latency.spec.ts"],
      // Runs strictly after every other spec in the "chromium" project has
      // finished (#62 incident: latency.spec.ts's own MCP tools/call probes
      // — run interleaved with mcp.spec.ts's calls under the default
      // alphabetical file ordering — combined to exceed the shared
      // per-minute Upstash rate-limit budget every preview-e2e request
      // shares from the same CI runner IP, 429ing mcp.spec.ts's and
      // security-headers.spec.ts's own MCP assertions). A `dependencies`
      // edge, not a delay/sleep: with `workers: 1` in CI this guarantees
      // latency.spec.ts's MCP calls never overlap any other spec's, so its
      // own budgeted sample size is the only consumer of the limit at that
      // point — never a reason to weaken mcp.spec.ts's own burst assertion.
      dependencies: ["chromium"],
    },
  ],
});
