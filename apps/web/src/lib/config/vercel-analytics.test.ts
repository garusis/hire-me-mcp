import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldEnableVercelAnalytics } from "./vercel-analytics";

describe("shouldEnableVercelAnalytics", () => {
  let originalVercelEnv: string | undefined;

  beforeEach(() => {
    originalVercelEnv = process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  it("is disabled in local dev (no VERCEL_ENV set) — matches Vitest's own environment", () => {
    delete process.env.VERCEL_ENV;
    expect(shouldEnableVercelAnalytics()).toBe(false);
  });

  it("is disabled on a preview Vercel deploy (VERCEL_ENV=preview) — e2e-preview runs against these", () => {
    process.env.VERCEL_ENV = "preview";
    expect(shouldEnableVercelAnalytics()).toBe(false);
  });

  it("is disabled on a development Vercel deploy (VERCEL_ENV=development)", () => {
    process.env.VERCEL_ENV = "development";
    expect(shouldEnableVercelAnalytics()).toBe(false);
  });

  it("is enabled only on a genuine production deploy (VERCEL_ENV=production)", () => {
    process.env.VERCEL_ENV = "production";
    expect(shouldEnableVercelAnalytics()).toBe(true);
  });
});
