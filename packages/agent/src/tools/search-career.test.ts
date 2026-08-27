import type { SearchCareerResultItem } from "@hire-me-mcp/core/search-career";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as searchCareerClient from "./search-career-client.js";

vi.mock("./search-career-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./search-career-client.js")>();
  return { ...actual, getAgentSearchCareer: vi.fn() };
});

function fixtureResult(overrides: Partial<SearchCareerResultItem> = {}): SearchCareerResultItem {
  return {
    text: "Built an event-driven order pipeline at House Numbers.",
    score: 0.82,
    sourceType: "experience",
    sourceId: "house-numbers-2022-senior-full-stack-engineer",
    chunkIndex: 0,
    citation: {
      entityType: "experience",
      entityId: "house-numbers-2022-senior-full-stack-engineer",
      label: "House Numbers — Senior Full-Stack Engineer",
    },
    ...overrides,
  };
}

// biome-ignore-start lint/suspicious/noExplicitAny: Mastra's ToolExecutionContext is irrelevant to these tests; createTool's execute return type also needs re-asserting since no outputSchema was given.
async function execute(input: unknown): Promise<SearchCareerToolResultForTests | undefined> {
  const { searchCareerTool } = await import("./search-career.js");
  const result = await searchCareerTool.execute?.(input as never, {} as any);
  return result as SearchCareerToolResultForTests | undefined;
}
// biome-ignore-end lint/suspicious/noExplicitAny: Mastra's ToolExecutionContext is irrelevant to these tests; createTool's execute return type also needs re-asserting since no outputSchema was given.

type SearchCareerToolResultForTests = import("./search-career.js").SearchCareerToolResult;

describe("searchCareerTool", () => {
  beforeEach(() => {
    vi.mocked(searchCareerClient.getAgentSearchCareer).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", async () => {
    const { searchCareerTool } = await import("./search-career.js");
    expect(searchCareerTool.id).toBe("search-career");
    expect(searchCareerTool.description.length).toBeGreaterThan(0);
  });

  it("describes the hybrid routing policy — semantic search vs. the deterministic tools", async () => {
    const { searchCareerTool } = await import("./search-career.js");
    expect(searchCareerTool.description).toMatch(/fuzzy|cross-cutting/i);
    expect(searchCareerTool.description).toMatch(
      /get-experience|search-projects|get-skill-evidence|deterministic/i,
    );
  });

  it("returns a typed unavailable result — never throws — when search is not configured", async () => {
    vi.mocked(searchCareerClient.getAgentSearchCareer).mockReturnValue({
      available: false,
      reason: "DATABASE_URL is not set.",
    });

    const result = await execute({ query: "event-driven architecture" });

    expect(result).toEqual({
      query: "event-driven architecture",
      available: false,
      reason: "DATABASE_URL is not set.",
      results: [],
      citations: [],
      truncated: false,
    });
  });

  it("calls the configured searchCareer with the query and topK, mapping results and citations", async () => {
    const searchCareer = vi.fn().mockResolvedValue({
      query: "event-driven architecture",
      results: [fixtureResult()],
      tookMs: 12,
    });
    vi.mocked(searchCareerClient.getAgentSearchCareer).mockReturnValue({
      available: true,
      searchCareer,
    });

    const result = await execute({ query: "event-driven architecture", topK: 3 });

    expect(searchCareer).toHaveBeenCalledWith("event-driven architecture", { topK: 3 });
    expect(result).toMatchObject({
      query: "event-driven architecture",
      available: true,
      truncated: false,
    });
    expect(result?.results).toHaveLength(1);
    expect(result?.citations).toEqual([
      {
        entityType: "experience",
        entityId: "house-numbers-2022-senior-full-stack-engineer",
        label: "House Numbers — Senior Full-Stack Engineer",
        // #270: parity with the deterministic tools — the marker arrives
        // spelled out so the model copies it instead of composing it.
        marker: "[cite:experience:house-numbers-2022-senior-full-stack-engineer]",
      },
    ]);
  });

  it("returns a typed unavailable result — never throws — when the real searchCareer call fails", async () => {
    const searchCareer = vi.fn().mockRejectedValue(new Error("stored embedding model mismatch"));
    vi.mocked(searchCareerClient.getAgentSearchCareer).mockReturnValue({
      available: true,
      searchCareer,
    });

    const result = await execute({ query: "event-driven architecture" });

    expect(result?.available).toBe(false);
    expect(result?.results).toEqual([]);
    expect(result?.citations).toEqual([]);
    if (result && !result.available) {
      expect(result.reason).toMatch(/stored embedding model mismatch/);
    }
  });

  it("requires a non-empty query", async () => {
    const { searchCareerInputSchema } = await import("./search-career.js");
    expect(searchCareerInputSchema.safeParse({}).success).toBe(false);
    expect(searchCareerInputSchema.safeParse({ query: "" }).success).toBe(false);
  });

  it("rejects an oversized query (bounded length security guard)", async () => {
    const { searchCareerInputSchema } = await import("./search-career.js");
    expect(searchCareerInputSchema.safeParse({ query: "x".repeat(501) }).success).toBe(false);
  });

  it("bounds topK to a small ceiling well below searchCareer's own MAX_TOP_K", async () => {
    const { searchCareerInputSchema } = await import("./search-career.js");
    expect(searchCareerInputSchema.safeParse({ query: "x", topK: 0 }).success).toBe(false);
    expect(searchCareerInputSchema.safeParse({ query: "x", topK: 11 }).success).toBe(false);
    expect(searchCareerInputSchema.safeParse({ query: "x", topK: 10 }).success).toBe(true);
  });

  it("rejects unexpected extra fields — strict schema", async () => {
    const { searchCareerInputSchema } = await import("./search-career.js");
    expect(searchCareerInputSchema.safeParse({ query: "x", unexpected: "field" }).success).toBe(
      false,
    );
  });
});

describe("applyRetrievalBudget", () => {
  it("keeps every result when the set is within both the count and character budgets", async () => {
    const { applyRetrievalBudget, MAX_RESULTS } = await import("./search-career.js");
    const results = [fixtureResult(), fixtureResult({ chunkIndex: 1 })];

    const budgeted = applyRetrievalBudget(results);

    expect(budgeted.results).toHaveLength(2);
    expect(budgeted.truncated).toBe(false);
    expect(MAX_RESULTS).toBeGreaterThanOrEqual(2);
  });

  it("truncates to at most MAX_RESULTS chunks, keeping the highest-scored (already-sorted) ones first", async () => {
    const { applyRetrievalBudget, MAX_RESULTS } = await import("./search-career.js");
    const oversized = Array.from({ length: MAX_RESULTS + 10 }, (_, i) =>
      fixtureResult({ chunkIndex: i, sourceId: `entry-${i}` }),
    );

    const budgeted = applyRetrievalBudget(oversized);

    expect(budgeted.results).toHaveLength(MAX_RESULTS);
    expect(budgeted.truncated).toBe(true);
    expect(budgeted.results.map((r) => r.sourceId)).toEqual(
      oversized.slice(0, MAX_RESULTS).map((r) => r.sourceId),
    );
  });

  it("truncates by total character budget even under the chunk-count ceiling — an oversized single result is cut, not dropped whole", async () => {
    const { applyRetrievalBudget, MAX_TOTAL_CHARACTERS } = await import("./search-career.js");
    const huge = fixtureResult({ text: "x".repeat(MAX_TOTAL_CHARACTERS * 2) });

    const budgeted = applyRetrievalBudget([huge]);

    expect(budgeted.truncated).toBe(true);
    expect(budgeted.results).toHaveLength(1);
    expect(budgeted.results[0]?.text.length).toBeLessThanOrEqual(MAX_TOTAL_CHARACTERS);
  });

  it("stops adding further results once the cumulative character budget is exhausted", async () => {
    const { applyRetrievalBudget, MAX_TOTAL_CHARACTERS } = await import("./search-career.js");
    const big = fixtureResult({ text: "x".repeat(MAX_TOTAL_CHARACTERS) });
    const another = fixtureResult({ text: "more text", sourceId: "second", chunkIndex: 1 });

    const budgeted = applyRetrievalBudget([big, another]);

    expect(budgeted.results).toHaveLength(1);
    expect(budgeted.truncated).toBe(true);
  });
});
