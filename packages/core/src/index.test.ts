import { describe, expect, it } from "vitest";
import {
  buildCitation,
  createDomainResult,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
  slugify,
  UnknownEntityError,
} from "./index.js";

describe("slugify", () => {
  it("lowercases and hyphenates whitespace-separated words", () => {
    expect(slugify("Hire Me MCP")).toBe("hire-me-mcp");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("  Senior  Engineer -- Full/Stack!! ")).toBe("senior-engineer-full-stack");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---already-slugged---")).toBe("already-slugged");
  });

  it("returns an empty string when there is nothing alphanumeric to keep", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("public entry point", () => {
  it("re-exports the domain result envelope, repository seam and citation helper together", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      skills: [
        {
          id: "fixture-skill",
          name: "Fixture Skill",
          aliases: [],
          category: "fixture-category",
          proficiency: "expert",
          evidence: [],
        },
      ],
    });

    const citation = buildCitation(repository, "skill", "fixture-skill");
    const result = createDomainResult({ ok: true }, [citation]);

    expect(result).toEqual({
      data: { ok: true },
      citations: [{ entityType: "skill", entityId: "fixture-skill", label: "Fixture Skill" }],
    });
  });

  it("re-exports UnknownEntityError for callers to catch the citation failure path", () => {
    const repository = createInMemoryCareerDataRepository(emptyCareerDataset());
    expect(() => buildCitation(repository, "skill", "missing")).toThrow(UnknownEntityError);
  });
});
