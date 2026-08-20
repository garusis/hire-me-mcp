import { describe, expect, it, vi } from "vitest";
import type { WritingListView } from "../src/lib/content";

const { listProjectSlugs, getWritingListView } = vi.hoisted(() => ({
  listProjectSlugs: vi.fn(),
  getWritingListView: vi.fn(),
}));

vi.mock("../src/lib/content", () => ({ listProjectSlugs, getWritingListView }));

const { getSiteUrl } = vi.hoisted(() => ({ getSiteUrl: vi.fn() }));
vi.mock("../src/lib/config/site-url", () => ({ getSiteUrl }));

function writingView(items: WritingListView["items"] = []): WritingListView {
  return { citations: [], items };
}

describe("sitemap", () => {
  it("includes every static route, absolute, under the configured base URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue([]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        "https://stub-deploy.example.com",
        "https://stub-deploy.example.com/experience",
        "https://stub-deploy.example.com/projects",
        "https://stub-deploy.example.com/skills",
        "https://stub-deploy.example.com/writing",
        "https://stub-deploy.example.com/mcp",
      ]),
    );
  });

  it("adds exactly one entry per project slug from the content layer — no stale or hardcoded entries", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue(["alpha-project"]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    let urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://stub-deploy.example.com/projects/alpha-project");
    expect(urls.filter((url) => url.includes("/projects/"))).toHaveLength(1);

    listProjectSlugs.mockReturnValue(["alpha-project", "beta-project"]);
    urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://stub-deploy.example.com/projects/beta-project");
    expect(urls.filter((url) => url.includes("/projects/"))).toHaveLength(2);
  });

  it("adds one entry per writing entry from the content layer, with lastModified from its publishedDate", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue([]);
    getWritingListView.mockReturnValue(
      writingView([
        {
          slug: "fixture-writing-entry",
          entry: {
            id: "fixture-writing-entry",
            title: "Fixture",
            publishedDate: "2024-01-15",
            summary: "s",
            body: "b",
          },
          citation: { entityType: "writing", entityId: "fixture-writing-entry", label: "Fixture" },
        },
      ]),
    );
    const { default: sitemap } = await import("./sitemap.js");

    const writingEntry = sitemap().find(
      (entry) => entry.url === "https://stub-deploy.example.com/writing/fixture-writing-entry",
    );

    expect(writingEntry).toBeDefined();
    expect(writingEntry?.lastModified).toEqual(new Date("2024-01-15"));
  });

  it("contains no duplicate URLs", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue(["alpha-project"]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    const urls = sitemap().map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
