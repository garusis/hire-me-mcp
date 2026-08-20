import { describe, expect, it, vi } from "vitest";

const { getSiteUrl, getRobotsIndexable } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getRobotsIndexable: vi.fn(),
}));

vi.mock("../src/lib/config/site-url", () => ({ getSiteUrl, getRobotsIndexable }));

describe("robots", () => {
  it("points to the sitemap under the configured base URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { default: robots } = await import("./robots.js");

    expect(robots().sitemap).toBe("https://stub-deploy.example.com/sitemap.xml");
  });

  it("allows crawling everything on a production (indexable) deploy", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { default: robots } = await import("./robots.js");

    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    expect(rules?.userAgent).toBe("*");
    expect(rules?.disallow).toBeUndefined();
  });

  it("disallows all crawling on a non-production (non-indexable) deploy", async () => {
    getSiteUrl.mockReturnValue("https://preview-abc.example.com");
    getRobotsIndexable.mockReturnValue(false);
    const { default: robots } = await import("./robots.js");

    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    expect(rules?.userAgent).toBe("*");
    expect(rules?.disallow).toBe("/");
  });
});
