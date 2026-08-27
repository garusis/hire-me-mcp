import type { Citation } from "@hire-me-mcp/core";
import { describe, expect, it, vi } from "vitest";
import { getWritingListView } from "../../src/lib/content/index.js";
import { resolveCitationSiteUrl, withCitationSiteUrls } from "./citation-site-urls.js";

vi.mock("../../src/lib/content/index.js", () => ({ getWritingListView: vi.fn() }));

// In tests no SITE_URL/VERCEL_* env vars are set, so getSiteUrl() resolves
// to the local dev origin — see src/lib/config/site-url.ts.
const ORIGIN = "http://localhost:3000";

function citation(overrides: Partial<Citation> & Pick<Citation, "entityType">): Citation {
  return { entityId: "fixture-id", label: "Fixture", ...overrides };
}

describe("resolveCitationSiteUrl", () => {
  it("maps an experience citation to its anchor on the /experience page", () => {
    expect(
      resolveCitationSiteUrl(citation({ entityType: "experience", entityId: "acme-role" })),
    ).toBe(`${ORIGIN}/experience#acme-role`);
  });

  it("maps a project citation to its /projects/[slug] detail page", () => {
    expect(resolveCitationSiteUrl(citation({ entityType: "project", entityId: "cowork" }))).toBe(
      `${ORIGIN}/projects/cowork`,
    );
  });

  it("maps skill and gap citations to their anchors on /skills", () => {
    expect(resolveCitationSiteUrl(citation({ entityType: "skill", entityId: "kubernetes" }))).toBe(
      `${ORIGIN}/skills#kubernetes`,
    );
    expect(resolveCitationSiteUrl(citation({ entityType: "gap", entityId: "dotnet" }))).toBe(
      `${ORIGIN}/skills#gap-dotnet`,
    );
  });

  it("maps a recommendation citation to its anchor on the /recommendations page", () => {
    expect(
      resolveCitationSiteUrl(
        citation({ entityType: "recommendation", entityId: "andre-treib-2026" }),
      ),
    ).toBe(`${ORIGIN}/recommendations#andre-treib-2026`);
  });

  it("maps a profile citation to the home page's profile section", () => {
    // Before #227 this fell through to a bare `/` because the shared
    // resolver had no `profile` case — a citation that pointed at the whole
    // site rather than at the record it came from. It now anchors on the
    // section that renders the profile.
    expect(resolveCitationSiteUrl(citation({ entityType: "profile" }))).toBe(`${ORIGIN}/#profile`);
  });

  it("maps a writing citation to the entry's canonical external url when the writing list has it", () => {
    vi.mocked(getWritingListView).mockReturnValue({
      items: [
        {
          slug: "fixture-post",
          entry: {
            id: "fixture-post",
            title: "Fixture Post",
            publishedDate: "2024-01-01",
            url: "https://example.com/fixture-post",
          },
        },
      ],
    } as unknown as ReturnType<typeof getWritingListView>);

    expect(
      resolveCitationSiteUrl(citation({ entityType: "writing", entityId: "fixture-post" })),
    ).toBe("https://example.com/fixture-post");
  });

  it("falls back to the /writing page when the writing list cannot be loaded (e.g. no content in a test harness)", () => {
    vi.mocked(getWritingListView).mockImplementation(() => {
      throw new Error("no dataset");
    });

    expect(
      resolveCitationSiteUrl(citation({ entityType: "writing", entityId: "fixture-post" })),
    ).toBe(`${ORIGIN}/writing`);
  });

  it("keeps a citation's own external url when it already has one", () => {
    const chunkCitation = {
      ...citation({ entityType: "project", entityId: "cowork" }),
      url: "https://github.com/garusis/cowork",
    };
    expect(resolveCitationSiteUrl(chunkCitation)).toBe("https://github.com/garusis/cowork");
  });
});

describe("withCitationSiteUrls", () => {
  it("adds a url to every citation lacking one, preserving every other field byte-for-byte", () => {
    const input: Citation[] = [
      citation({ entityType: "experience", entityId: "acme-role", fragment: "highlights.0" }),
    ];

    const enriched = withCitationSiteUrls(input);

    expect(enriched).toEqual([
      {
        entityType: "experience",
        entityId: "acme-role",
        fragment: "highlights.0",
        label: "Fixture",
        url: `${ORIGIN}/experience#acme-role`,
      },
    ]);
  });

  it("returns a new array and never mutates the input citations", () => {
    const input: Citation[] = [citation({ entityType: "skill", entityId: "typescript" })];

    const enriched = withCitationSiteUrls(input);

    expect(enriched).not.toBe(input);
    expect(input[0]).not.toHaveProperty("url");
  });
});
