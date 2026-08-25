import type { ExperienceEntry, Gap, Skill } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listGaps } from "./list-gaps.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

const fixtureRole: ExperienceEntry = {
  id: "fixture-role",
  company: "Fixtureco",
  role: "Fixture Engineer",
  startDate: "2020-01",
  summary: "Fixture summary.",
  highlights: ["Did a fixture thing"],
  tech: ["typescript"],
};

const typescript: Skill = {
  id: "typescript",
  name: "TypeScript",
  aliases: ["ts"],
  category: "language",
  proficiency: "expert",
  evidence: [{ entityType: "experience", entityId: "fixture-role", label: "Fixture role" }],
};

const rustGap: Gap = {
  id: "rust",
  name: "Rust",
  aliases: ["rustlang"],
  statement: "No production Rust experience. Closest adjacent work is systems-flavored TypeScript.",
  relatedSkills: ["typescript"],
};

const golangGap: Gap = {
  id: "golang",
  name: "Go",
  aliases: ["go"],
  statement: "Has not shipped Go professionally.",
  relatedSkills: ["typescript", "not-a-real-skill-id"],
};

function fixtureRepository(gaps: Gap[] = [rustGap, golangGap]) {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    experience: [fixtureRole],
    skills: [typescript],
    gaps,
  });
}

describe("listGaps", () => {
  it("returns every gap sorted by id ascending, deterministically", () => {
    const result = listGaps(fixtureRepository());

    expect(result.data.map((entry) => entry.id)).toEqual(["golang", "rust"]);

    const shuffled = listGaps(fixtureRepository([golangGap, rustGap]));
    expect(shuffled.data.map((entry) => entry.id)).toEqual(["golang", "rust"]);
  });

  it("passes each statement through byte-identical to the authored content", () => {
    const result = listGaps(fixtureRepository());

    const rust = result.data.find((entry) => entry.id === "rust");
    expect(rust?.statement).toBe(rustGap.statement);
    expect(rust?.name).toBe("Rust");
    expect(rust?.aliases).toEqual(["rustlang"]);
  });

  it("resolves relatedSkills ids to skill citations, skipping unresolvable ids", () => {
    const result = listGaps(fixtureRepository());

    const golang = result.data.find((entry) => entry.id === "golang");
    expect(golang?.relatedSkills).toEqual([
      { entityType: "skill", entityId: "typescript", label: "TypeScript" },
    ]);
  });

  it("returns citations[i] as a gap citation resolving to data[i], labeled with the gap name", () => {
    const result = listGaps(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((entry, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "gap",
        entityId: entry.id,
        label: entry.name,
      });
    });
  });

  it("returns an empty list and empty citations for an empty dataset — never throws", () => {
    const result = listGaps(fixtureRepository([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
