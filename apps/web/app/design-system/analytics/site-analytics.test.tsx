import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const analyticsSpy = vi.fn(() => null);
vi.mock("@vercel/analytics/next", () => ({ Analytics: analyticsSpy }));

describe("SiteAnalytics", () => {
  afterEach(() => {
    cleanup();
    analyticsSpy.mockClear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders Vercel Analytics on a genuine production deploy (VERCEL_ENV=production)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { SiteAnalytics } = await import("./site-analytics");

    render(<SiteAnalytics />);

    expect(analyticsSpy).toHaveBeenCalledTimes(1);
  });

  it("does not render Vercel Analytics in local dev (no VERCEL_ENV)", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    const { SiteAnalytics } = await import("./site-analytics");

    render(<SiteAnalytics />);

    expect(analyticsSpy).not.toHaveBeenCalled();
  });

  it("does not render Vercel Analytics on a preview deploy (VERCEL_ENV=preview) — no third-party tracking during e2e-preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { SiteAnalytics } = await import("./site-analytics");

    render(<SiteAnalytics />);

    expect(analyticsSpy).not.toHaveBeenCalled();
  });
});
