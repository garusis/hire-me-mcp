import { describe, expect, it } from "vitest";
import {
  buildApiSecurityHeaders,
  buildHtmlSecurityHeaders,
  HSTS_HEADER_VALUE,
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
