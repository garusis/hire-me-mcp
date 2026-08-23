import { Analytics } from "@vercel/analytics/next";
import { shouldEnableVercelAnalytics } from "../../../src/lib/config/vercel-analytics";

/**
 * Mounts Vercel Analytics (#81) — page views and web vitals for the
 * marketing/portfolio surface, separate from and complementary to the
 * agent-facing usage analytics pipeline (#79, `@hire-me-mcp/core/analytics`)
 * which covers MCP tool calls and chat question themes that Vercel
 * Analytics cannot see. See `app/privacy/page.tsx` for how both are
 * described together.
 *
 * Vercel Analytics itself sets no third-party tracking cookies — it beacons
 * page-view/web-vitals events to Vercel's own `/_vercel/insights/script.js`
 * collector, first-party, cookieless
 * (https://vercel.com/docs/analytics/privacy-policy). This component adds
 * one more guarantee on top: it renders nothing at all — not even the
 * script tag — unless `shouldEnableVercelAnalytics()` says this is a
 * genuine production deploy, so local dev, unit tests, and the
 * `e2e-preview` Playwright suite (which runs against a real preview
 * deployment) never load it and never send it traffic.
 */
export function SiteAnalytics() {
  if (!shouldEnableVercelAnalytics()) {
    return null;
  }
  return <Analytics />;
}
