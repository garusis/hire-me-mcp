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

/**
 * Marks a test that makes a REAL `gemini-3.5-flash-lite` call (#264).
 *
 * `preview-e2e` is a required check, so nothing it runs may depend on a
 * third party's free-tier daily allowance — when the Preview-scoped Google
 * project hit its 500 requests/day cap, the live chat specs failed on every
 * open PR regardless of content, and the merge queue was effectively gated
 * on a quota reset. Tagging (rather than moving files) keeps the split
 * declarative and file-layout-independent: the required projects below
 * `grepInvert` this tag, and the `chromium-live-model` project runs exactly
 * the tagged tests, in the separate, NON-required `preview-chat-live` job.
 *
 * Add the tag to any new test that calls the model for real. A required
 * assertion must never need one.
 */
const LIVE_MODEL_TAG = /@live-model/;

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
      // Every spec except latency.spec.ts and chat-deterministic.spec.ts —
      // see the two projects below for why each is split out.
      testIgnore: ["**/latency.spec.ts", "**/chat-deterministic.spec.ts"],
      grepInvert: LIVE_MODEL_TAG,
    },
    {
      // #264: the model-free chat contract specs. Its own project purely so
      // a run can EXCLUDE it by name: these specs need the target to serve a
      // scripted turn, and a Production deployment refuses to (by design —
      // see `apps/web/lib/chat/test-scenarios.ts`). `scripts/certify-production.mjs`
      // therefore omits this project when it points the suite at production,
      // and asserts the refusal directly instead. A tag + `--grep-invert`
      // could not express that: a project-level `grepInvert` (which the two
      // required projects need for `@live-model`) overrides the CLI one.
      name: "chromium-scripted-chat",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/chat-deterministic.spec.ts"],
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
      grepInvert: LIVE_MODEL_TAG,
    },
    {
      // #264: every `@live-model` test, wherever it lives — the two chat
      // conversation specs and latency.spec.ts's chat probe. Never run by
      // the required `preview-e2e` job; see the LIVE_MODEL_TAG doc above.
      name: "chromium-live-model",
      use: { ...devices["Desktop Chrome"] },
      grep: LIVE_MODEL_TAG,
    },
  ],
});
