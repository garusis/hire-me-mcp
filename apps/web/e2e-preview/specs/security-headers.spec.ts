/**
 * Security header suite for #42, run against a REAL deployed origin (a
 * Vercel preview in CI, or any `BASE_URL` locally/production) — reusing
 * `playwright.preview.config.ts` and the same `gotoRoute`/`consoleErrors`
 * fixtures and Vercel Deployment Protection bypass every other spec in
 * this directory uses (see `apps/web/e2e-preview/specs/mcp.spec.ts`'s own
 * module doc for why this suite exists separately from `apps/web/e2e` and
 * `apps/web/mcp-e2e`: this is the one place that proves the header policy
 * survives real network/platform behavior — Vercel's own edge/redirect
 * layer, cold starts, and, critically here, the deployment protection
 * bypass flow itself (a known risk area called out on the issue: the
 * bypass's own cookie-setting redirect must not be broken by the CSP or
 * middleware).
 *
 * `apps/web/e2e/security-headers.smoke.spec.ts` is the always-on-CI twin
 * of this suite (real local build, same assertions); `mcp.spec.ts` in this
 * same directory already exercises the full initialize/tools-list/
 * tools-call/rate-limit sequence against the real deployed MCP endpoint —
 * this file adds the header-set assertions that suite doesn't make,
 * rather than duplicating its protocol coverage.
 */

import {
  buildApiSecurityHeaders,
  HSTS_HEADER_VALUE,
  PERMISSIONS_POLICY,
} from "../../src/lib/security/build-security-headers";
import { bypassHeaders } from "../helpers/bypass";
import { expect, test } from "../helpers/fixtures";
import { ROUTES } from "../helpers/routes";

test.describe("HTML route headers", () => {
  test("home page carries the exact documented header set, with a CSP nonce and no unsafe-inline/eval", async ({
    request,
  }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["strict-transport-security"]).toBe(HSTS_HEADER_VALUE);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

test.describe("MCP route headers", () => {
  test("/api/mcp carries the exact documented API header set against the real deployed origin", async ({
    request,
  }) => {
    const response = await request.post("/api/mcp", {
      headers: {
        ...bypassHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });

    expect(response.ok()).toBe(true);
    const expectedHeaders = buildApiSecurityHeaders();
    const headers = response.headers();
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(headers[name.toLowerCase()], `expected ${name} to be "${value}"`).toBe(value);
    }
    expect(headers["content-security-policy"]).not.toContain("nonce-");

    // The response body is the MCP endpoint's own concern (streamed SSE,
    // not plain JSON, since the request declares `text/event-stream`
    // acceptable) — already covered end to end by this directory's
    // `mcp.spec.ts` (`tools/list returns exactly the expected tool set`,
    // run via the real SDK client). This test's job is the header set.
  });
});

test.describe("zero CSP console violations across the public page walk", () => {
  const walk = [...ROUTES, { path: "/privacy", name: "privacy", heading: /privacy/i }];

  for (const route of walk) {
    test(`${route.path} — no CSP violations`, async ({ gotoRoute, page, consoleErrors }) => {
      const violations: string[] = [];
      await page.exposeFunction("__reportCspViolation", (detail: string) => {
        violations.push(detail);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const reporter = (window as unknown as { __reportCspViolation: (detail: string) => void })
            .__reportCspViolation;
          reporter(`${event.violatedDirective}: blocked ${event.blockedURI}`);
        });
      });

      const response = await gotoRoute(route.path);
      expect(response?.ok(), `expected ${route.path} to respond ok()`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      expect(violations, `CSP violations on ${route.path}: ${violations.join("; ")}`).toEqual([]);
      expect(consoleErrors.errors, `console errors on ${route.path}`).toEqual([]);
    });
  }

  test("an unknown route's 404 page has no CSP violations", async ({ gotoRoute, page }) => {
    const violations: string[] = [];
    await page.exposeFunction("__reportCspViolation", (detail: string) => {
      violations.push(detail);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const reporter = (window as unknown as { __reportCspViolation: (detail: string) => void })
          .__reportCspViolation;
        reporter(`${event.violatedDirective}: blocked ${event.blockedURI}`);
      });
    });

    const response = await gotoRoute("/this-route-does-not-exist-zzz");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();

    expect(violations).toEqual([]);
  });

  test("opening the chat widget has no CSP violations", async ({ gotoRoute, page }) => {
    const violations: string[] = [];
    await page.exposeFunction("__reportCspViolation", (detail: string) => {
      violations.push(detail);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const reporter = (window as unknown as { __reportCspViolation: (detail: string) => void })
          .__reportCspViolation;
        reporter(`${event.violatedDirective}: blocked ${event.blockedURI}`);
      });
    });

    await gotoRoute("/");
    await page.getByRole("button", { name: /ask about marcos/i }).click();
    await expect(
      page.getByRole("button", { name: /what did marcos build at house numbers/i }),
    ).toBeVisible();

    expect(violations, `CSP violations opening chat: ${violations.join("; ")}`).toEqual([]);
  });
});
