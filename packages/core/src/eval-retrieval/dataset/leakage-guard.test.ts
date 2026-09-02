import { describe, expect, it } from "vitest";
import { chunkCareerData } from "../../chunking/index.js";
import { createContentCareerDataRepository } from "../../repository.js";
import { checkFuzzyQueryLeakage, normalizeForLeakageCheck } from "./leakage-guard.js";
import type { GoldenQuery } from "./schema.js";

function fuzzyQuery(overrides: Partial<GoldenQuery> = {}): GoldenQuery {
  return {
    id: "fuzzy-test",
    query: "some fuzzy recruiter phrasing",
    category: "fuzzy",
    expectedSources: [{ sourceType: "story", sourceId: "irrelevant" }],
    ...overrides,
  };
}

describe("normalizeForLeakageCheck", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeForLeakageCheck("Tell me,  about a TIME!\nMarcos led.")).toBe(
      "tell me about a time marcos led",
    );
  });
});

describe("checkFuzzyQueryLeakage", () => {
  it("passes when no fuzzy query's normalized text is a substring of any chunk's normalized text", () => {
    const queries = [fuzzyQuery({ id: "f1", query: "something entirely unrelated to any chunk" })];
    const chunks = [
      { sourceType: "story", sourceId: "s1", text: "A completely different sentence." },
    ];
    const result = checkFuzzyQueryLeakage(queries, chunks);
    expect(result).toEqual({ valid: true, leaks: [] });
  });

  it("fails when a fuzzy query's complete normalized text appears verbatim inside a chunk", () => {
    const queries = [fuzzyQuery({ id: "f1", query: "rebuild a damaged client relationship" })];
    const chunks = [
      {
        sourceType: "story",
        sourceId: "s1",
        text: "I had to rebuild a damaged client relationship while under pressure.",
      },
    ];
    const result = checkFuzzyQueryLeakage(queries, chunks);
    expect(result.valid).toBe(false);
    expect(result.leaks).toEqual([{ queryId: "f1", sourceType: "story", sourceId: "s1" }]);
  });

  it("ignores non-fuzzy categories (exact cases may deliberately overlap)", () => {
    const queries = [
      fuzzyQuery({
        id: "exact-1",
        category: "exact",
        query: "rebuild a damaged client relationship",
      }),
    ];
    const chunks = [
      {
        sourceType: "story",
        sourceId: "s1",
        text: "I had to rebuild a damaged client relationship.",
      },
    ];
    const result = checkFuzzyQueryLeakage(queries, chunks);
    expect(result).toEqual({ valid: true, leaks: [] });
  });

  it("is case/punctuation/whitespace insensitive", () => {
    const queries = [fuzzyQuery({ id: "f1", query: "REBUILD a damaged, client   relationship" })];
    const chunks = [
      { sourceType: "story", sourceId: "s1", text: "rebuild a damaged client relationship." },
    ];
    const result = checkFuzzyQueryLeakage(queries, chunks);
    expect(result.valid).toBe(false);
  });

  it("the real committed story content has zero fuzzy-query leaks from ./cases.ts", async () => {
    const { GOLDEN_QUERIES } = await import("./cases.js");
    const repository = createContentCareerDataRepository();
    const chunks = chunkCareerData(repository.getDataset()).filter(
      (chunk) => chunk.sourceType === "story",
    );
    const result = checkFuzzyQueryLeakage(GOLDEN_QUERIES, chunks);
    expect(result).toEqual({ valid: true, leaks: [] });
  });
});
