import { type NextRequest, NextResponse } from "next/server";
import {
  buildApiSecurityHeaders,
  buildHtmlSecurityHeaders,
} from "./src/lib/security/build-security-headers";

/**
 * Applies the #42 security header policy to every response, split by route
 * group per the issue: `/api/*` (the MCP endpoint, the chat stream, stats,
 * cron) gets the minimal JSON-endpoint set from `buildApiSecurityHeaders`;
 * everything else — every HTML page, and the handful of non-HTML document
 * routes (`/llms.txt`, `/manifest.webmanifest`, `/robots.txt`,
 * `/sitemap.xml`, `/.well-known/mcp.json`) — gets the nonce-scoped CSP
 * document policy from `buildHtmlSecurityHeaders`, harmlessly ignored by
 * browsers for non-document responses.
 *
 * The nonce follows the pattern in Next.js's own CSP documentation
 * (`docs/01-app/.../15-content-security-policy.mdx`, `examples/with-strict-csp`):
 * generated fresh per request, set on the CSP response header, and
 * forwarded on both the request (`x-nonce`, so a Server Component can read
 * it via `headers()`, e.g. `app/layout.tsx`'s theme script and
 * `src/lib/seo/json-ld-script.tsx`) and the response (so it's inspectable
 * without re-parsing the CSP header — see `middleware.test.ts`). Next.js
 * detects this same nonce from the CSP header and applies it automatically
 * to the inline scripts it generates itself (the streaming hydration
 * payload) — only this app's own inline scripts need it passed explicitly.
 */
export function middleware(request: NextRequest): NextResponse {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (isApiRoute) {
    const response = NextResponse.next();
    applyHeaders(response, buildApiSecurityHeaders());
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Vercel's own Preview Toolbar (never Production) needs its documented
  // CSP allowances — see the doc comment on `HtmlSecurityHeaderOptions`.
  const allowVercelToolbar = process.env.VERCEL_ENV === "preview";
  const htmlHeaders = buildHtmlSecurityHeaders(nonce, { allowVercelToolbar });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyHeaders(response, htmlHeaders);
  response.headers.set("x-nonce", nonce);
  return response;
}

function applyHeaders(response: NextResponse, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
