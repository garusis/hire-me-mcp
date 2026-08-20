/**
 * Vercel Deployment Protection bypass (#58, owner-approved decision on the
 * issue: Standard Protection stays ON for previews; CI authenticates via
 * Vercel's "Protection Bypass for Automation" rather than disabling
 * protection). Two mechanisms, both documented at
 * https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation:
 *
 * - Request contexts (`page.request`, `sitemap.xml`/`robots.txt` fetches):
 *   the `x-vercel-protection-bypass` header, set once via Playwright's
 *   `extraHTTPHeaders` (playwright.preview.config.ts) so every request in
 *   the suite carries it automatically.
 * - Real browser navigation (`page.goto`): a header alone doesn't survive
 *   Vercel's own redirects/asset requests reliably, so the documented
 *   mechanism is the `x-vercel-protection-bypass` *query param* plus
 *   `x-vercel-set-bypass-cookie=true` on the first navigation, which sets a
 *   cookie Vercel then honours for the rest of that browser context. This
 *   module never logs the secret's value — only whether one is configured.
 */

const BYPASS_HEADER = "x-vercel-protection-bypass";
const BYPASS_SECRET_ENV = "VERCEL_AUTOMATION_BYPASS_SECRET";

/** Reads the bypass secret, if any. Never printed — callers must not log this value. */
export function bypassSecret(): string | undefined {
  const value = process.env[BYPASS_SECRET_ENV];
  return value && value.length > 0 ? value : undefined;
}

/** Whether the target origin is a Vercel Deployment-Protection-guarded preview requiring a bypass. */
export function bypassEnabled(): boolean {
  return bypassSecret() !== undefined;
}

/** Header set for `page.request`/`APIRequestContext` calls — see the module doc for why this doesn't cover `page.goto`. */
export function bypassHeaders(): Record<string, string> {
  const secret = bypassSecret();
  return secret ? { [BYPASS_HEADER]: secret } : {};
}

/**
 * Appends the bypass query params to `path` for a real browser navigation.
 * A no-op (returns `path` unchanged) when no secret is configured, so this
 * is safe to call unconditionally against a local/production target that
 * isn't protection-gated at all.
 */
export function withBypassQuery(path: string): string {
  const secret = bypassSecret();
  if (!secret) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}x-vercel-protection-bypass=${secret}&x-vercel-set-bypass-cookie=true`;
}
