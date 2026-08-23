import { expect, test } from "@playwright/test";
import {
  buildApiSecurityHeaders,
  HSTS_HEADER_VALUE,
  PERMISSIONS_POLICY,
} from "../src/lib/security/build-security-headers";

/**
 * Security header + CSP-enforcement suite for #42, run against a real
 * `next build` + `next start` server (this file lives in `apps/web/e2e`,
 * picked up by the root `playwright.config.ts`'s `testDir`, the same
 * always-on CI job every other smoke spec here runs in — unlike
 * `e2e-preview`, which only runs against a deployed Vercel preview and can
 * be skipped for forked PRs). This is deliberately where the "must always
 * run in CI" half of the issue's acceptance criteria lives:
 *
 *   - exact header values on an HTML route and the MCP route
 *   - zero CSP console violations across a full walk of every public page,
 *     including opening the chat widget
 *
 * `apps/web/mcp-e2e/security-headers.spec.ts` covers the MCP
 * initialize/tools-list/tools-call sequence with headers enforced, and
 * `apps/web/e2e-preview/specs/security-headers.spec.ts` re-proves both
 * against a real deployed preview.
 */

const HTML_ROUTES_TO_WALK = [
  { path: "/", heading: "Marcos Javier Alvarez" },
  { path: "/experience", heading: "Experience" },
  { path: "/projects", heading: "Projects" },
  { path: "/skills", heading: "Skills" },
  { path: "/writing", heading: "Writing" },
  { path: "/mcp", heading: "Add me to your AI" },
  { path: "/privacy", heading: /privacy/i },
] as const;

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
    expect(csp).toMatch(/style-src 'self' 'nonce-[^']+'/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("a second request gets a different nonce than the first (per-request, not cached)", async ({
    request,
  }) => {
    const first = await request.get("/experience");
    const second = await request.get("/experience");

    const firstNonce = /nonce-([^']+)/.exec(first.headers()["content-security-policy"] ?? "")?.[1];
    const secondNonce = /nonce-([^']+)/.exec(
      second.headers()["content-security-policy"] ?? "",
    )?.[1];

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
  });
});

test.describe("MCP route headers", () => {
  test("/api/mcp carries the exact documented API header set — no nonce, default-src none, no-store", async ({
    request,
  }) => {
    const response = await request.post("/api/mcp", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });

    const expectedHeaders = buildApiSecurityHeaders();
    const headers = response.headers();
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(headers[name.toLowerCase()], `expected ${name} to be "${value}"`).toBe(value);
    }
    expect(headers["content-security-policy"]).not.toContain("nonce-");
    expect(headers["permissions-policy"]).toBeUndefined();
  });
});

test.describe("zero CSP console violations across every public page", () => {
  for (const route of HTML_ROUTES_TO_WALK) {
    test(`${route.path} — no CSP violations, no console errors`, async ({ page }) => {
      const violations: string[] = [];
      const consoleErrors: string[] = [];
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
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      const response = await page.goto(route.path);
      expect(response?.ok(), `expected ${route.path} to respond ok()`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      expect(violations, `CSP violations on ${route.path}: ${violations.join("; ")}`).toEqual([]);
      expect(consoleErrors, `console errors on ${route.path}: ${consoleErrors.join("; ")}`).toEqual(
        [],
      );
    });
  }

  test("a project detail page reached from /projects has no CSP violations", async ({ page }) => {
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

    await page.goto("/projects");
    const firstProjectLink = page.getByRole("article").first().getByRole("link").first();
    await firstProjectLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(violations, `CSP violations on project detail: ${violations.join("; ")}`).toEqual([]);
  });

  test("an unknown route's 404 page has no CSP violations", async ({ page }) => {
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

    const response = await page.goto("/this-route-does-not-exist-zzz");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();

    expect(violations).toEqual([]);
  });

  test("opening the chat widget has no CSP violations", async ({ page }) => {
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

    await page.goto("/");
    await page.getByRole("button", { name: /ask about marcos/i }).click();
    await expect(
      page.getByRole("button", { name: /what did marcos build at house numbers/i }),
    ).toBeVisible();

    expect(violations, `CSP violations opening chat: ${violations.join("; ")}`).toEqual([]);
  });
});
