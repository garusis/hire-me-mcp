import { describe, expect, it } from "vitest";
import {
  buildApiSecurityHeaders,
  buildHtmlSecurityHeaders,
  HSTS_HEADER_VALUE,
  MCP_STREAMING_CACHE_CONTROL_VALUE,
  PERMISSIONS_POLICY,
} from "./build-security-headers";

describe("buildHtmlSecurityHeaders", () => {
  it("embeds the given nonce into both script-src and style-src, and nowhere else", () => {
    const headers = buildHtmlSecurityHeaders("test-nonce-123");
    const csp = headers["Content-Security-Policy"];

    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-123' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-test-nonce-123'");
    expect(csp?.split("nonce-test-nonce-123").length).toBe(3); // two occurrences => 3 parts
  });

  it("never allows unsafe-inline or unsafe-eval for scripts", () => {
    const headers = buildHtmlSecurityHeaders("n");
    const csp = headers["Content-Security-Policy"] ?? "";
    const scriptSrc = csp.split(";").find((directive) => directive.trim().startsWith("script-src"));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("denies framing via both frame-ancestors and X-Frame-Options", () => {
    const headers = buildHtmlSecurityHeaders("n");

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("sets the documented HSTS value", () => {
    const headers = buildHtmlSecurityHeaders("n");

    expect(headers["Strict-Transport-Security"]).toBe(HSTS_HEADER_VALUE);
    expect(HSTS_HEADER_VALUE).toBe("max-age=31536000; includeSubDomains");
  });

  it("sets nosniff, a strict referrer policy, and the deny-all permissions policy", () => {
    const headers = buildHtmlSecurityHeaders("n");

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe(PERMISSIONS_POLICY);
  });

  it("scopes every fetch directive to same-origin ('self'), enumerating no external origin", () => {
    const headers = buildHtmlSecurityHeaders("n");
    const csp = headers["Content-Security-Policy"] ?? "";

    for (const directive of ["default-src", "img-src", "font-src", "connect-src"]) {
      const match = csp.split(";").find((entry) => entry.trim().startsWith(directive));
      expect(match?.trim()).toBe(`${directive} 'self'`);
    }
  });

  it("allows no vercel.live origin by default (production has no Vercel Toolbar)", () => {
    const headers = buildHtmlSecurityHeaders("n");
    const csp = headers["Content-Security-Policy"] ?? "";

    expect(csp).not.toContain("vercel.live");
  });

  it("with allowVercelToolbar, adds exactly Vercel's documented CSP allowances for its Preview Toolbar/Comments (script-src, connect-src, img-src, frame-src, style-src, font-src) without loosening any other origin", () => {
    const headers = buildHtmlSecurityHeaders("n", { allowVercelToolbar: true });
    const csp = headers["Content-Security-Policy"] ?? "";

    expect(csp).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' https://vercel.live");
    expect(csp).toContain("connect-src 'self' https://vercel.live wss://ws-us3.pusher.com");
    expect(csp).toContain("img-src 'self' https://vercel.live https://vercel.com");
    // No nonce here, deliberately: Vercel injects the Toolbar's inline
    // styles itself, with no way for it to know this app's per-request
    // nonce, so a nonce'd style-src blocks it outright regardless of
    // unsafe-inline (browsers ignore unsafe-inline once a nonce is
    // present) — see the comment on ALLOW_VERCEL_TOOLBAR_STYLE_SRC.
    expect(csp).toContain("style-src 'self' https://vercel.live 'unsafe-inline'");
    expect(csp).toContain("font-src 'self' https://vercel.live https://assets.vercel.com");
    expect(csp).toContain("frame-src https://vercel.live");
    // Still no unsafe-eval, still frame-ancestors 'none' — the toolbar
    // allowance never touches those.
    const scriptSrc = csp.split(";").find((directive) => directive.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("buildApiSecurityHeaders", () => {
  it("denies every fetch directive by default, with no script/style allowance at all", () => {
    const headers = buildApiSecurityHeaders();

    expect(headers["Content-Security-Policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("prevents caching of per-client responses", () => {
    const headers = buildApiSecurityHeaders();

    expect(headers["Cache-Control"]).toBe("no-store");
  });

  it("sets nosniff and the same HSTS value as the HTML route group", () => {
    const headers = buildApiSecurityHeaders();

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toBe(HSTS_HEADER_VALUE);
  });

  it("denies framing and strips referrers entirely, appropriate for a JSON endpoint", () => {
    const headers = buildApiSecurityHeaders();

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
  });

  it("does not include a Permissions-Policy header (only HTML documents evaluate it)", () => {
    const headers = buildApiSecurityHeaders();

    expect(headers["Permissions-Policy"]).toBeUndefined();
  });
});

describe("MCP_STREAMING_CACHE_CONTROL_VALUE", () => {
  it("is a distinct, equally non-cacheable value from the default no-store", () => {
    expect(MCP_STREAMING_CACHE_CONTROL_VALUE).toBe("no-cache, no-transform");
    expect(MCP_STREAMING_CACHE_CONTROL_VALUE).not.toBe(buildApiSecurityHeaders()["Cache-Control"]);
  });
});
