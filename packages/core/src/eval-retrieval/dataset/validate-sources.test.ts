import { describe, expect, it } from "vitest";
import { createContentCareerDataRepository, emptyCareerDataset } from "../../repository.js";
import type { GoldenQuery } from "./schema.js";
import { resolveCareerSourceKeys, validateGoldenDatasetSources } from "./validate-sources.js";

function query(overrides: Partial<GoldenQuery> = {}): GoldenQuery {
  return {
    id: "test-query",
    query: "test",
    category: "exact",
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    ...overrides,
  };
}

describe("resolveCareerSourceKeys", () => {
  it("resolves a source key for every entity across every dataset array", () => {
    const dataset = {
      profile: { id: "p1" } as never,
      experience: [{ id: "e1" } as never],
      projects: [{ id: "pr1" } as never],
      skills: [{ id: "s1" } as never],
      gaps: [{ id: "g1" } as never],
      education: [{ id: "ed1" } as never],
      writing: [{ id: "w1" } as never],
    };
    const keys = resolveCareerSourceKeys(dataset);
    expect(keys).toEqual(
      new Set([
        "profile:p1",
        "experience:e1",
        "project:pr1",
        "skill:s1",
        "gap:g1",
        "education:ed1",
        "writing:w1",
      ]),
    );
  });

  it("resolves no profile key when the dataset has no profile authored", () => {
    const keys = resolveCareerSourceKeys(emptyCareerDataset());
    expect(keys).toEqual(new Set());
  });
});

describe("validateGoldenDatasetSources", () => {
  it("passes when every expectedSources entry resolves to a real career-data record", () => {
    const dataset = { ...emptyCareerDataset(), skills: [{ id: "typescript" } as never] };
    const result = validateGoldenDatasetSources([query()], dataset);
    expect(result).toEqual({ valid: true, danglingReferences: [] });
  });

  it("fails and names the offending query/source when a referenced source id doesn't exist", () => {
    const dataset = emptyCareerDataset();
    const result = validateGoldenDatasetSources([query()], dataset);
    expect(result.valid).toBe(false);
    expect(result.danglingReferences).toEqual([
      { queryId: "test-query", sourceType: "skill", sourceId: "typescript" },
    ]);
  });

  it("an absent-topic entry with no expected sources never produces a dangling reference", () => {
    const dataset = emptyCareerDataset();
    const result = validateGoldenDatasetSources(
      [
        query({
          id: "absent-x",
          category: "absent-topic",
          expectedSources: [],
          expectEmpty: true,
        }),
      ],
      dataset,
    );
    expect(result).toEqual({ valid: true, danglingReferences: [] });
  });

  it("the real committed career-data content has zero dangling references from ./cases.ts", async () => {
    const { GOLDEN_QUERIES } = await import("./cases.js");
    const repository = createContentCareerDataRepository();
    const result = validateGoldenDatasetSources(GOLDEN_QUERIES, repository.getDataset());
    expect(result).toEqual({ valid: true, danglingReferences: [] });
  });
});
