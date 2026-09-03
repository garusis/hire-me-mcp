import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
        "https://stub-deploy.example.com/recommendations",
        "https://stub-deploy.example.com/mcp",
      ]),
    );
  });

  it("omits /writing while nothing is published there, and lists it once something is (#233)", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue([]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    let urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/writing"))).toBe(false);

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
    urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://stub-deploy.example.com/writing");
    expect(urls).toContain("https://stub-deploy.example.com/writing/fixture-writing-entry");
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

  it("includes the public privacy note (#81) but never the private, noindex stats route", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue([]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://stub-deploy.example.com/privacy");
    expect(urls.some((url) => url.includes("/stats"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/"))).toBe(false);
  });

  // #296 — the locked visibility boundary (#288): stories are queryable
  // through MCP/chat but never get a passive public route. The top-level
  // path segment (right after the domain — where a dedicated /stories
  // route would live, as opposed to a project or writing slug that simply
  // contains the word) must never be "stories" or "story", for any URL
  // this function emits, real or stubbed slugs alike.
  it("never emits a URL whose top-level path segment is 'stories' or 'story' — no passive story route (#296)", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    listProjectSlugs.mockReturnValue(["alpha-project"]);
    getWritingListView.mockReturnValue(writingView());
    const { default: sitemap } = await import("./sitemap.js");

    const urls = sitemap().map((entry) => entry.url);
    const topLevelSegments = urls.map((url) => new URL(url).pathname.split("/")[1] ?? "");

    expect(topLevelSegments).not.toContain("stories");
    expect(topLevelSegments).not.toContain("story");
  });

  // Filesystem-level companion to the URL check above: even before any
  // route function runs, there must be no `app/stories` directory for
  // Next.js's file-system router to pick up as a page.
  it("has no app/stories directory on disk — no story route can exist to be listed (#296)", () => {
    const appDir = dirname(fileURLToPath(import.meta.url));
    expect(existsSync(join(appDir, "stories"))).toBe(false);
  });
});
