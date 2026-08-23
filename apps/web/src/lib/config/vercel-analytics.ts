/**
 * Whether Vercel Analytics (`<Analytics />`, `@vercel/analytics/next`) is
 * enabled for this render (#81). Mirrors `getRobotsIndexable()`'s
 * production-only stance: only a genuine Vercel **production** deploy
 * (`VERCEL_ENV === "production"`) enables it. Preview deploys (including
 * the `e2e-preview` Playwright suite, which runs against a real preview
 * deployment), Vercel "development" deploys, and local dev/unit test runs
 * (no `VERCEL_ENV` at all) never load the analytics script — so tests and
 * previews never send real traffic to Vercel's collector, and adding
 * Vercel Analytics can never make a preview or local run non-deterministic
 * or network-dependent.
 */
export function shouldEnableVercelAnalytics(): boolean {
  return process.env.VERCEL_ENV === "production";
}
