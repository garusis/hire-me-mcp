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

  it("allows crawling pages on a production (indexable) deploy while disallowing only the tag-filter query space", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { default: robots } = await import("./robots.js");

    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    expect(rules?.userAgent).toBe("*");
    expect(rules?.disallow).toEqual(["/*?tags="]);
  });

  it("disallows the ?tags= filter combinations on an indexable deploy, so crawlers cannot walk the 2^N filter-URL space", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { default: robots } = await import("./robots.js");

    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    const disallow = rules?.disallow;
    const disallowed =
      disallow === undefined ? [] : Array.isArray(disallow) ? disallow : [disallow];

    expect(disallowed).toContain("/*?tags=");
    expect(disallowed).not.toContain("/");
    expect(disallowed).not.toContain("/projects");
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

  it("does not disallow /llms.txt or /llms-full.txt on an indexable deploy (#37)", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getRobotsIndexable.mockReturnValue(true);
    const { default: robots } = await import("./robots.js");

    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    const disallow = rules?.disallow;
    const disallowed =
      disallow === undefined ? [] : Array.isArray(disallow) ? disallow : [disallow];

    expect(disallowed).not.toContain("/llms.txt");
    expect(disallowed).not.toContain("/llms-full.txt");
  });

  // #296 — a story/stories rule of either polarity would itself be evidence
  // that a passive /stories route exists to allow or disallow; robots.ts has
  // no reason to ever mention one.
  it("never mentions a story/stories path, on an indexable or non-indexable deploy (#296)", async () => {
    for (const indexable of [true, false]) {
      getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
      getRobotsIndexable.mockReturnValue(indexable);
      const { default: robots } = await import("./robots.js");

      const serialized = JSON.stringify(robots()).toLowerCase();
      expect(serialized).not.toContain("stories");
      expect(serialized).not.toContain("story");
    }
  });
});
