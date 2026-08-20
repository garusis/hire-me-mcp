import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMcpEndpointUrl, getRobotsIndexable, getSiteUrl, MCP_ROUTE_PATH } from "./site-url";

const ENV_KEYS = ["SITE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;

describe("site-url", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {};
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("falls back to localhost when no env var is set (local dev)", () => {
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("prefers an explicit SITE_URL override over anything Vercel-derived", () => {
    process.env.SITE_URL = "https://custom.example.com/";
    process.env.VERCEL_URL = "preview-abc123.vercel.app";
    expect(getSiteUrl()).toBe("https://custom.example.com");
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL on a production deploy", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "hire-me-mcp-web.vercel.app";
    process.env.VERCEL_URL = "hire-me-mcp-web-abc123.vercel.app";
    expect(getSiteUrl()).toBe("https://hire-me-mcp-web.vercel.app");
  });

  it("uses VERCEL_URL (the deployment-specific domain) on a preview deploy", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "hire-me-mcp-web.vercel.app";
    process.env.VERCEL_URL = "hire-me-mcp-web-git-feature-branch.vercel.app";
    expect(getSiteUrl()).toBe("https://hire-me-mcp-web-git-feature-branch.vercel.app");
  });

  it("derives the MCP endpoint URL by joining the site URL with the route path — the one place that join happens", () => {
    process.env.SITE_URL = "https://hire-me-mcp-web.vercel.app";
    expect(getMcpEndpointUrl()).toBe(`https://hire-me-mcp-web.vercel.app${MCP_ROUTE_PATH}`);
  });

  it("exposes the route path as a constant matching the actual mounted route", () => {
    expect(MCP_ROUTE_PATH).toBe("/api/mcp");
  });

  it("is not indexable on a preview deploy (VERCEL_ENV=preview)", () => {
    process.env.VERCEL_ENV = "preview";
    expect(getRobotsIndexable()).toBe(false);
  });

  it("is not indexable in local dev (no VERCEL_ENV set)", () => {
    expect(getRobotsIndexable()).toBe(false);
  });

  it("is not indexable on a development Vercel deploy (VERCEL_ENV=development)", () => {
    process.env.VERCEL_ENV = "development";
    expect(getRobotsIndexable()).toBe(false);
  });

  it("is indexable only on a production deploy (VERCEL_ENV=production)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getRobotsIndexable()).toBe(true);
  });
});
