/**
 * The single, reviewed security header sets for #42 — defined once here and
 * applied by `apps/web/middleware.ts` to every response. Kept as pure
 * functions (no `next/server` imports) so the policy itself is unit
 * testable without booting a request; see
 * `apps/web/e2e/security-headers.smoke.spec.ts` and
 * `apps/web/mcp-e2e/security-headers.spec.ts` for the black-box proof that
 * the real server actually sends these. Rationale for every value lives in
 * `docs/security-headers.md`, which this module's exported constants and
 * shape are the source of truth for — keep both in sync when either
 * changes.
 *
 * Two route groups, per the issue: HTML pages (documents that render in a
 * browser tab, so framing/script/style directives matter) and API/MCP
 * routes (JSON-only, never framed, never holding an inline script — they
 * get a minimal, maximally restrictive set instead of a document policy
 * that doesn't apply to them).
 */

/**
 * One year, `includeSubDomains`, no `preload`. #33 closed with no custom
 * domain — this deployment is reached only at
 * `hire-me-mcp-web.vercel.app`, and `.app` is an entire gTLD on the
 * browser's HSTS preload list (Google requires HTTPS for every `.app`
 * registration as a condition of the TLD), so every browser already
 * refuses plaintext HTTP to this host before this header is ever read.
 * Sending it anyway is still correct: it's what security scanners
 * (Mozilla Observatory, securityheaders.com) and a defense-in-depth
 * baseline expect, and it's what protects any future HTTP client that
 * doesn't ship the `.app` preload list (some non-browser HTTP clients
 * don't special-case TLDs). `includeSubDomains` is safe to set now because
 * no subdomain of `hire-me-mcp-web.vercel.app` exists or is served by this
 * project — there is nothing for it to lock out. `preload` is deliberately
 * withheld: submission to the HSTS preload list is effectively
 * irreversible in practice and is meant for a domain whose hosting is
 * final, which — per #33 — this one explicitly is not (a future custom
 * domain would need its own, separately reasoned decision).
 */
export const HSTS_HEADER_VALUE = "max-age=31536000; includeSubDomains";

/**
 * Deny every browser feature this static/portfolio site has no use for.
 * Nothing here calls a camera, microphone, geolocation, USB device, or
 * payment sheet, and FLoC/Topics-style tracking is explicitly opted out of
 * regardless of what any embedding context might otherwise grant.
 */
export const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()";

/**
 * Builds the per-request CSP for an HTML document, nonce-scoped so no
 * `unsafe-inline`/`unsafe-eval` is ever needed for scripts. `strict-dynamic`
 * lets the one nonce'd bootstrap script (Next's own hydration script,
 * auto-nonced from this header — see the Next.js CSP docs) propagate trust
 * to scripts it inserts at runtime via the DOM (e.g. Vercel Analytics'
 * `/_vercel/insights/script.js`, appended via `document.createElement` from
 * inside the already-trusted app bundle) without allowlisting an origin for
 * it. Every fetch directive is scoped to `'self'` — the app has no
 * externally-hosted fonts (`next/font/google` self-hosts at build time, see
 * `app/fonts.ts`), no third-party images, and both the chat stream
 * (`/api/chat`) and the MCP client demo (`/api/mcp`) are same-origin, so
 * there is nothing to allowlist rather than remove.
 */
export function buildHtmlSecurityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": HSTS_HEADER_VALUE,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": PERMISSIONS_POLICY,
  };
}

/**
 * The API/MCP route group's header set. No nonce, no script/style
 * allowance at all — these routes only ever return JSON, never an inline
 * script or stylesheet, so `default-src 'none'` is strictly more
 * restrictive than the HTML policy rather than a relaxed variant of it.
 * `Cache-Control: no-store` is the one addition the HTML group doesn't
 * need: every response here (`/api/mcp`, `/api/chat`, `/api/stats`,
 * `/api/cron/*`) is either per-caller or privileged, and none of them set
 * their own caching directive today, so this is safe to apply uniformly.
 */
export function buildApiSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": HSTS_HEADER_VALUE,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  };
}
