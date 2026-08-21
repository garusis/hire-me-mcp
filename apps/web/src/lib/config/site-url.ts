/**
 * Single source of truth for the site's own absolute origin and the MCP
 * endpoint URL derived from it (#43). Every place on the site that needs to
 * *display* the public MCP endpoint — today only `app/mcp/page.tsx` —
 * imports `getMcpEndpointUrl()` rather than concatenating a literal, so
 * preview and production deploys each show their own correct URL and there
 * is exactly one string to change if the mounted route
 * (`app/api/mcp/route.ts`, #11) ever moves.
 *
 * Resolution order, most specific first:
 * 1. `SITE_URL` — an explicit override, set in Vercel Project Settings or a
 *    local `.env.local` per the convention in `.env.example`. Not required
 *    today (no env vars are yet in Vercel for this project — see
 *    `apps/web/README.md#environment-variables`); this exists so setting it
 *    later needs no code change.
 * 2. On a Vercel **production** deploy (`VERCEL_ENV === "production"`),
 *    `VERCEL_PROJECT_PRODUCTION_URL` — the stable production domain
 *    (`hire-me-mcp-web.vercel.app`, per `apps/web/README.md`'s "Live URL"),
 *    not the per-build `VERCEL_URL`.
 * 3. Otherwise, `VERCEL_URL` — the deployment-specific domain Vercel sets
 *    automatically for every preview build, so each preview shows its own
 *    URL rather than production's.
 * 4. `http://localhost:3000` — local dev fallback, matching `pnpm dev`'s
 *    default port.
 *
 * `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` are Vercel's own automatically
 * injected System Environment Variables (no project configuration needed) —
 * see https://vercel.com/docs/environment-variables/system-environment-variables.
 */

/** The MCP server's mounted path — must match `apps/web/app/api/mcp/route.ts`. */
export const MCP_ROUTE_PATH = "/api/mcp";

/**
 * The one hardcoded production origin in the repo (#17) — every
 * connection-metadata surface (`apps/web/lib/mcp/connection-metadata.ts`,
 * and through it `docs/mcp.md`'s and the root `README.md`'s generated
 * regions) derives the fixed production MCP endpoint URL from this
 * constant plus `MCP_ROUTE_PATH`, rather than re-typing the domain. This
 * is deliberately distinct from `getSiteUrl()`, which resolves per-deploy
 * (production, preview, or local) from environment variables — the
 * generator that writes docs runs outside any Vercel deploy context, so it
 * needs a value that doesn't depend on `VERCEL_ENV` being set at all.
 */
export const PRODUCTION_SITE_URL = "https://hire-me-mcp-web.vercel.app";

/** The fixed production MCP endpoint URL — `PRODUCTION_SITE_URL` + `MCP_ROUTE_PATH`. */
export const PRODUCTION_MCP_ENDPOINT_URL = `${PRODUCTION_SITE_URL}${MCP_ROUTE_PATH}`;

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveSiteUrl(): string {
  const explicit = process.env.SITE_URL;
  if (explicit) {
    return stripTrailingSlash(explicit);
  }

  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

/** The site's own absolute origin, e.g. `https://hire-me-mcp-web.vercel.app`. */
export function getSiteUrl(): string {
  return resolveSiteUrl();
}

/** The full, absolute public MCP endpoint URL — `getSiteUrl()` + `MCP_ROUTE_PATH`. */
export function getMcpEndpointUrl(): string {
  return `${getSiteUrl()}${MCP_ROUTE_PATH}`;
}

/**
 * Whether this deploy should be indexed by search engines (#44). Only a
 * genuine Vercel **production** deploy (`VERCEL_ENV === "production"`) is
 * indexable — preview deploys, Vercel "development" deploys, and local dev
 * (no `VERCEL_ENV` at all) all emit `noindex`, so a preview URL can never
 * outrank or duplicate the production site in search results.
 */
export function getRobotsIndexable(): boolean {
  return process.env.VERCEL_ENV === "production";
}
