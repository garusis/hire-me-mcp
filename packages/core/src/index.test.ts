import { describe, expect, it } from "vitest";
import {
  buildAliasIndex,
  buildCitation,
  createDomainResult,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
  getExperience,
  getProfile,
  search,
  searchProjects,
  slugify,
  tokenize,
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

  it("re-exports getProfile and getExperience, both returning a DomainResult envelope", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      profile: {
        id: "profile-fixture",
        name: "Fixture Person",
        headline: "Fixture Engineer",
        location: "Fixtureville",
        availability: "open",
        summary: "Fixture summary.",
        contacts: [{ label: "Website", url: "https://example.test" }],
      },
      experience: [
        {
          id: "fixture-role-fixtureco-2020",
          company: "Fixtureco",
          role: "Fixture Engineer",
          startDate: "2020-01",
          endDate: "2022-01",
          summary: "Fixture summary.",
          highlights: ["Did a fixture thing"],
          tech: ["typescript"],
        },
      ],
    });

    const profileResult = getProfile(repository);
    expect(profileResult.data.id).toBe("profile-fixture");
    expect(profileResult.citations).toHaveLength(1);

    const experienceResult = getExperience(repository, { company: "Fixtureco" });
    expect(experienceResult.data.map((entry) => entry.id)).toEqual(["fixture-role-fixtureco-2020"]);
    expect(experienceResult.citations).toHaveLength(1);
  });

  it("re-exports the reusable search module (tokenize, buildAliasIndex, search) alongside searchProjects", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      projects: [
        {
          id: "fixture-project",
          name: "Fixture Project",
          summary: "A fixture summary.",
          role: "Engineer",
          tech: ["typescript"],
          links: [],
          body: "Fixture body.",
        },
      ],
      skills: [
        {
          id: "typescript",
          name: "TypeScript",
          aliases: ["ts"],
          category: "language",
          proficiency: "expert",
          evidence: [],
        },
      ],
    });

    expect(tokenize("TypeScript!")).toEqual(["typescript"]);
    const aliasIndex = buildAliasIndex([{ canonical: "typescript", aliases: ["ts"] }]);
    expect(aliasIndex.resolve("ts")).toBe("typescript");
    expect(
      search(
        [{ id: "a", fields: [{ name: "tag", weight: 100, tokens: ["typescript"] }] }],
        ["typescript"],
      ).map((r) => r.id),
    ).toEqual(["a"]);

    const searchResult = searchProjects(repository, "ts");
    expect(searchResult.data.map((r) => r.project.id)).toEqual(["fixture-project"]);
    expect(searchResult.citations).toHaveLength(1);
  });
});
