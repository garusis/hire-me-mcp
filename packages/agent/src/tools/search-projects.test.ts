import type { DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationMarkers } from "./citation-markers.js";
import { searchProjectsInputSchema, searchProjectsTool } from "./search-projects.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, searchProjects: vi.fn() };
});

type ProjectSearchResult = ReturnType<typeof core.searchProjects>["data"][number];

const fixtureResult: ProjectSearchResult = {
  project: {
    id: "fixture-project",
    name: "Fixture Project",
    summary: "A fixture project.",
    role: "Fixture Role",
    body: "Fixture body.",
    tech: ["typescript"],
    links: [],
  },
  score: 100,
  matches: [{ field: "tag", token: "typescript" }],
};

describe("searchProjectsTool", () => {
  beforeEach(() => {
    vi.mocked(core.searchProjects).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(searchProjectsTool.id).toBe("search-projects");
    expect(searchProjectsTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's searchProjects with query and options, returning the DomainResult with every citation marker-annotated (#270)", async () => {
    const domainResult: DomainResult<ProjectSearchResult[]> = {
      data: [fixtureResult],
      citations: [{ entityType: "project", entityId: "fixture-project", label: "Fixture Project" }],
    };
    vi.mocked(core.searchProjects).mockReturnValue(domainResult);

    const result = await searchProjectsTool.execute?.(
      { query: "typescript", tags: ["typescript"], limit: 5 },
      {} as never,
    );

    expect(core.searchProjects).toHaveBeenCalledTimes(1);
    expect(core.searchProjects).toHaveBeenCalledWith(expect.anything(), "typescript", {
      tags: ["typescript"],
      limit: 5,
    });
    expect(result).toEqual(withCitationMarkers(domainResult));
  });

  // Issue 275 — "keyword and/or technology tag" is only true if either
  // argument stands on its own, so a tag-only call must validate.
  it("accepts a tag-only call, with no query at all", () => {
    expect(searchProjectsInputSchema.safeParse({ tags: ["typescript"] }).success).toBe(true);
  });

  it("accepts a call with neither query nor tags (an honest empty result, not a validation error)", () => {
    expect(searchProjectsInputSchema.safeParse({}).success).toBe(true);
  });

  it("passes an omitted query straight through to packages/core, which ranks by the tags instead", async () => {
    vi.mocked(core.searchProjects).mockReturnValue({ data: [fixtureResult], citations: [] });

    await searchProjectsTool.execute?.({ tags: ["typescript"] }, {} as never);

    expect(core.searchProjects).toHaveBeenCalledWith(expect.anything(), undefined, {
      tags: ["typescript"],
      limit: undefined,
    });
  });

  it("accepts an empty-string query (a valid, honest 'no results' query)", () => {
    expect(searchProjectsInputSchema.safeParse({ query: "" }).success).toBe(true);
  });

  it("rejects an oversized query (bounded length security guard)", () => {
    expect(searchProjectsInputSchema.safeParse({ query: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects a non-positive limit", () => {
    expect(searchProjectsInputSchema.safeParse({ query: "x", limit: 0 }).success).toBe(false);
  });

  it("rejects a limit above the bounded maximum", () => {
    expect(searchProjectsInputSchema.safeParse({ query: "x", limit: 51 }).success).toBe(false);
  });

  it("rejects unexpected extra fields — strict schema", () => {
    expect(searchProjectsInputSchema.safeParse({ query: "x", unexpected: "field" }).success).toBe(
      false,
    );
  });

  it("never calls the core service when input validation fails", () => {
    searchProjectsInputSchema.safeParse({});

    expect(core.searchProjects).not.toHaveBeenCalled();
  });
});
