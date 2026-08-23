import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
import {
  buildApiSecurityHeaders,
  HSTS_HEADER_VALUE,
} from "./src/lib/security/build-security-headers";

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://hire-me-mcp-web.vercel.app"));
}

describe("middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not allow vercel.live when VERCEL_ENV is unset (production/local default)", () => {
    const response = middleware(request("/"));

    expect(response.headers.get("Content-Security-Policy")).not.toContain("vercel.live");
  });

  it("does not allow vercel.live on a production deploy (VERCEL_ENV=production)", () => {
    vi.stubEnv("VERCEL_ENV", "production");

    const response = middleware(request("/"));

    expect(response.headers.get("Content-Security-Policy")).not.toContain("vercel.live");
  });

  it("allows the documented Vercel Toolbar CSP origins on a preview deploy (VERCEL_ENV=preview), so the Toolbar Vercel injects there doesn't trip the enforcing CSP", () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = middleware(request("/"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("https://vercel.live");
    expect(csp).toContain("frame-src https://vercel.live");
  });

  it("applies the HTML header set, including a CSP with a fresh nonce, to a page route", async () => {
    const response = middleware(request("/experience"));

    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(response.headers.get("Strict-Transport-Security")).toBe(HSTS_HEADER_VALUE);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("carries the same nonce on the response's own x-nonce header, so a Server Component reading `headers()` sees the value that was actually enforced", () => {
    const response = middleware(request("/"));

    const cspNonce = /nonce-([^']+)/.exec(
      response.headers.get("Content-Security-Policy") ?? "",
    )?.[1];

    expect(cspNonce).toBeTruthy();
    expect(response.headers.get("x-nonce")).toBe(cspNonce);
  });

  it("generates a different nonce on every request", () => {
    const first = middleware(request("/"));
    const second = middleware(request("/"));

    const firstNonce = /nonce-([^']+)/.exec(
      first.headers.get("Content-Security-Policy") ?? "",
    )?.[1];
    const secondNonce = /nonce-([^']+)/.exec(
      second.headers.get("Content-Security-Policy") ?? "",
    )?.[1];

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it("applies the API header set (no nonce, default-src none, no-store) to /api/mcp", () => {
    const response = middleware(request("/api/mcp"));
    const expected = buildApiSecurityHeaders();

    for (const [name, value] of Object.entries(expected)) {
      expect(response.headers.get(name)).toBe(value);
    }
    expect(response.headers.get("Content-Security-Policy")).not.toContain("nonce-");
  });

  it("applies the API header set to every route under /api, not just /api/mcp", () => {
    const response = middleware(request("/api/chat"));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});
