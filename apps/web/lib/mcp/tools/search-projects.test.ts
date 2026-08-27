import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withCitationSiteUrls } from "../citation-site-urls.js";
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
      citations: withCitationSiteUrls(domainResult.citations),
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
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(citations));
  });

  // Issue 275 — the description has always promised search "by keyword
  // AND/OR technology tag", but `query` was required, so the tag-only call a
  // model naturally makes from that promise failed validation instead.
  describe("tag-only search (#275)", () => {
    it("accepts a tags-only call and delegates it to the domain service", async () => {
      vi.mocked(core.searchProjects).mockReturnValue({ data: [fixtureResult], citations: [] });
      const executor = createToolExecutor(searchProjectsTool);

      const result = await executor({ tags: ["typescript"] });

      expect(result.isError).toBeUndefined();
      expect(core.searchProjects).toHaveBeenCalledWith(expect.anything(), undefined, {
        tags: ["typescript"],
        limit: undefined,
      });
    });

    it("accepts a call with neither query nor tags, returning the domain service's empty result", async () => {
      vi.mocked(core.searchProjects).mockReturnValue({ data: [], citations: [] });
      const executor = createToolExecutor(searchProjectsTool);

      const result = await executor({});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ data: [], citations: [] });
    });

    it("advertises query as optional in the published input schema, matching the description", () => {
      const jsonSchema = z.toJSONSchema(searchProjectsTool.inputSchema) as unknown as {
        required?: string[];
      };
      expect(jsonSchema.required ?? []).not.toContain("query");
    });

    it("its description tells a model that either argument works on its own", () => {
      expect(searchProjectsTool.description).toMatch(/tag-only search/i);
    });
  });

  it("maps an invalid limit (wrong type) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "typescript", limit: "three" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  // Issue 276 — range constraints used to report a bare "limit: Invalid
  // input", identical for 0, -1 and 101, giving a self-correcting agent
  // nothing to correct against.
  it.each([0, -1, 51, 1.5])(
    "reports limit %s by naming the field, the constraint and the whole acceptable range (#276)",
    async (limit) => {
      const executor = createToolExecutor(searchProjectsTool);

      const result = await executor({ query: "typescript", limit });

      const message = (result.structuredContent as { message: string }).message;
      expect(message).toBe("limit: must be an integer between 1 and 50");
      expect(message).not.toContain("Invalid input");
    },
  );

  it("advertises a sane bounded maximum for limit instead of Number.MAX_SAFE_INTEGER (#243)", () => {
    const jsonSchema = z.toJSONSchema(searchProjectsTool.inputSchema) as unknown as {
      properties: { limit: { maximum?: number } };
    };
    expect(jsonSchema.properties.limit.maximum).toBe(50);
  });

  it("rejects a limit above the advertised maximum as invalid_input", async () => {
    const executor = createToolExecutor(searchProjectsTool);

    const result = await executor({ query: "typescript", limit: 51 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("declares a human-readable title and an outputSchema for its structuredContent (#241, #242)", () => {
    expect(searchProjectsTool.title).toBeTruthy();
    expect(searchProjectsTool.outputSchema).toBeDefined();
  });
});
