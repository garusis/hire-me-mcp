import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { searchProjectsTool } from "./search-projects.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, searchProjects: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.searchProjects`'s return type — see `search-projects.ts` for why. */
type ProjectSearchResult = ReturnType<typeof core.searchProjects>["data"][number];

function projectResult(
  overrides: Partial<ProjectSearchResult["project"]> & Pick<ProjectSearchResult["project"], "id">,
): ProjectSearchResult {
  return {
    project: {
      name: "Fixture Project",
      summary: "A fixture project summary.",
      role: "Engineer",
      tech: ["typescript"],
      links: [],
      body: "Fixture body text.",
      ...overrides,
    },
    score: 100,
    matches: [{ field: "tag", token: "typescript" }],
  };
}

const fixtureResult = projectResult({ id: "fixture-project" });

describe("searchProjectsTool", () => {
  beforeEach(() => {
    vi.mocked(core.searchProjects).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(searchProjectsTool.name).toBe("search-projects");
    expect(searchProjectsTool.description.length).toBeGreaterThan(0);
  });

  it("states that matching is keyword/tag-based today and does not promise semantic understanding", () => {
    const description = searchProjectsTool.description.toLowerCase();
    expect(description).toMatch(/keyword|tag-based/);
    // The caveat is allowed to name "semantic" only to disclaim it (e.g. "no semantic
    // ranking") — it must never read as a promise of semantic/embedding-based matching.
    expect(description).not.toMatch(/uses semantic|semantic search|semantic understanding/);
  });

  it("calls the domain service with the query and options, returning its data unmodified (happy path)", async () => {
    const domainResult: DomainResult<ProjectSearchResult[]> = {
      data: [fixtureResult],
      citations: [{ entityType: "project", entityId: "fixture-project", label: "Fixture Project" }],
    };
    vi.mocked(core.searchProjects).mockReturnValue(domainResult);
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "typescript" });

    expect(core.searchProjects).toHaveBeenCalledWith(expect.anything(), "typescript", {
      tags: undefined,
      limit: undefined,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: domainResult.citations,
    });
  });

  it("passes optional tags and limit through to the domain service", async () => {
    vi.mocked(core.searchProjects).mockReturnValue({ data: [fixtureResult], citations: [] });
    const executor = createToolExecutor(searchProjectsTool);

    await executor({ query: "typescript", tags: ["typescript", "aws"], limit: 3 });

    expect(core.searchProjects).toHaveBeenCalledWith(expect.anything(), "typescript", {
      tags: ["typescript", "aws"],
      limit: 3,
    });
  });

  it("accepts an empty query string (edge input) and returns whatever the domain service reports", async () => {
    vi.mocked(core.searchProjects).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("returns a SUCCESSFUL empty-list result when the query matches nothing, not an error", async () => {
    vi.mocked(core.searchProjects).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "cobol mainframe" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("passes citations through by deep equality, in the same order (contract test)", async () => {
    const citations: DomainResult<ProjectSearchResult[]>["citations"] = [
      { entityType: "project", entityId: "fixture-project", label: "Fixture Project" },
    ];
    vi.mocked(core.searchProjects).mockReturnValue({ data: [fixtureResult], citations });
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "typescript" });

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(citations);
  });

  it("maps invalid input (missing required query) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps an invalid limit (wrong type) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "typescript", limit: "three" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
