import { fileURLToPath } from "node:url";
import type { ExperienceEntry } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { getExperience } from "./get-experience.js";
import {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

const realContentDir = fileURLToPath(new URL("../../career-data/content/", import.meta.url));

function entry(overrides: Partial<ExperienceEntry> & Pick<ExperienceEntry, "id">): ExperienceEntry {
  return {
    company: "Fixtureco",
    role: "Fixture Engineer",
    startDate: "2020-01",
    endDate: "2021-01",
    summary: "Fixture summary.",
    highlights: ["Did a fixture thing"],
    tech: ["typescript"],
    ...overrides,
  };
}

const oldest = entry({
  id: "oldest-role",
  company: "Old Co",
  startDate: "2013-02",
  endDate: "2015-06",
  tech: ["php"],
});
const middleA = entry({
  id: "middle-role-a",
  company: "Middle Co",
  startDate: "2016-02",
  endDate: "2018-06",
  tech: ["nodejs"],
});
// Same startDate as middleA, but ends earlier — tie-breaker case.
const middleB = entry({
  id: "middle-role-b",
  company: "Concurrent Co",
  startDate: "2016-02",
  endDate: "2017-01",
  tech: ["angularjs"],
});
const pastRecent = entry({
  id: "recent-role",
  company: "Recent Co",
  startDate: "2020-12",
  endDate: "2022-03",
  tech: ["typescript", "aws"],
});
const current = entry({
  id: "current-role",
  company: "Current Co",
  startDate: "2022-05",
  endDate: undefined,
  tech: ["typescript", "react"],
});

function fixtureRepository() {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    experience: [oldest, middleA, middleB, pastRecent, current],
  });
}

describe("getExperience", () => {
  it("with no filter, returns all entries in the documented stable order", () => {
    const result = getExperience(fixtureRepository());

    expect(result.data.map((e) => e.id)).toEqual([
      "current-role",
      "recent-role",
      "middle-role-a",
      "middle-role-b",
      "oldest-role",
    ]);
  });

  it("filters by company (exact match)", () => {
    const result = getExperience(fixtureRepository(), { company: "Old Co" });

    expect(result.data.map((e) => e.id)).toEqual(["oldest-role"]);
  });

  it("filters by a single technology tag", () => {
    const result = getExperience(fixtureRepository(), { tech: ["php"] });

    expect(result.data.map((e) => e.id)).toEqual(["oldest-role"]);
  });

  it("filters by multiple technology tags with OR semantics (matches any)", () => {
    const result = getExperience(fixtureRepository(), { tech: ["php", "angularjs"] });

    expect(result.data.map((e) => e.id).sort()).toEqual(["middle-role-b", "oldest-role"]);
  });

  it("matches technology tags case-insensitively, like company and search-projects' tags (#226)", () => {
    const result = getExperience(fixtureRepository(), { tech: ["TypeScript"] });

    expect(result.data.map((e) => e.id).sort()).toEqual(["current-role", "recent-role"]);
  });

  it("matches mixed-case and padded technology tags identically to their canonical form (#226)", () => {
    const canonical = getExperience(fixtureRepository(), { tech: ["php"] });
    const variant = getExperience(fixtureRepository(), { tech: ["  PHP  "] });

    expect(variant.data).toEqual(canonical.data);
    expect(variant.data.map((e) => e.id)).toEqual(["oldest-role"]);
  });

  it("filters by date range, matching entries that overlap it", () => {
    const result = getExperience(fixtureRepository(), { from: "2017-01", to: "2019-01" });

    expect(result.data.map((e) => e.id)).toEqual(["middle-role-a", "middle-role-b"]);
  });

  it("filters by date range including a role with no end date (still open)", () => {
    const result = getExperience(fixtureRepository(), { from: "2023-01", to: "2024-01" });

    expect(result.data.map((e) => e.id)).toEqual(["current-role"]);
  });

  it("current-only filter returns only the entry with no end date", () => {
    const result = getExperience(fixtureRepository(), { status: "current" });

    expect(result.data.map((e) => e.id)).toEqual(["current-role"]);
  });

  it("past-only filter returns only entries with an end date", () => {
    const result = getExperience(fixtureRepository(), { status: "past" });

    expect(result.data.map((e) => e.id)).toEqual([
      "recent-role",
      "middle-role-a",
      "middle-role-b",
      "oldest-role",
    ]);
  });

  it("combines filter fields with AND semantics across fields", () => {
    const result = getExperience(fixtureRepository(), {
      tech: ["nodejs", "angularjs"],
      status: "past",
      from: "2016-01",
      to: "2016-12",
    });

    expect(result.data.map((e) => e.id).sort()).toEqual(["middle-role-a", "middle-role-b"]);
  });

  it("a filter matching nothing returns an empty list with an empty citation array, no throw", () => {
    expect(() => getExperience(fixtureRepository(), { company: "Nonexistent Co" })).not.toThrow();

    const result = getExperience(fixtureRepository(), { company: "Nonexistent Co" });

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("every returned entry has a citation resolving to its source entity", () => {
    const result = getExperience(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((entry, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "experience",
        entityId: entry.id,
        label: `${entry.role}, ${entry.company}`,
      });
    });
  });

  it("is deterministic: identical input yields byte-identical output across repeated calls", () => {
    const repository = fixtureRepository();

    const first = getExperience(repository, { status: "past" });
    const second = getExperience(repository, { status: "past" });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  describe("real content (integration)", () => {
    it("every returned entry cites a resolvable entity", () => {
      const repository = createContentCareerDataRepository({ contentDir: realContentDir });

      const result = getExperience(repository);

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.citations).toHaveLength(result.data.length);
      result.citations.forEach((citation) => {
        expect(citation.entityType).toBe("experience");
      });
      expect(result.data.map((e) => e.id)).toEqual(result.citations.map((c) => c.entityId));
    });
  });
});
